import { Redis } from "@upstash/redis"
import { hashToken } from "./auth"
import { getRedis } from "./redis"
import type { Post } from "./types"

// ── Types ──

export interface AgentStats {
  total_broadcasts: number
  total_slides: number
  last_seen: string
  peak_viewers: number
  total_votes: number
}

// ── Magic link tokens ──

export async function storeMagicToken(token: string, email: string): Promise<void> {
  await getRedis().set(`tvt:magic:${token}`, JSON.stringify({ email, created_at: new Date().toISOString() }), { ex: 600 })
}

/**
 * Atomically consume a magic token — GET + DEL in a pipeline.
 * Returns the token data if it existed, null if already used or expired.
 * Prevents double-verification race from concurrent requests.
 */
export async function consumeMagicToken(token: string): Promise<{ email: string; created_at: string } | null> {
  const r = getRedis()
  const key = `tvt:magic:${token}`
  const pipeline = r.pipeline()
  pipeline.get(key)
  pipeline.del(key)
  const [data] = await pipeline.exec<[string | null, number]>()
  if (!data) return null
  return typeof data === "string" ? JSON.parse(data) : data
}

/** @deprecated Use consumeMagicToken for atomic get+delete */
export async function getMagicToken(token: string): Promise<{ email: string; created_at: string } | null> {
  const data = await getRedis().get<string>(`tvt:magic:${token}`)
  if (!data) return null
  return typeof data === "string" ? JSON.parse(data) : data
}

/** @deprecated Use consumeMagicToken for atomic get+delete */
export async function deleteMagicToken(token: string): Promise<void> {
  await getRedis().del(`tvt:magic:${token}`)
}

// ── Users ──

export async function getOrCreateUser(email: string): Promise<{ email: string; created_at: string }> {
  const key = `tvt:user:${email}`
  const existing = await getRedis().get<string>(key)
  if (existing) {
    return typeof existing === "string" ? JSON.parse(existing) : existing
  }
  const user = { email, created_at: new Date().toISOString() }
  await getRedis().set(key, JSON.stringify(user))
  return user
}

// ── Agent ownership ──

const MAX_AGENTS_PER_USER = 5

export async function claimAgent(email: string, streamerName: string, hashedApiKey: string): Promise<boolean> {
  const r = getRedis()

  // Check agent limit
  const currentAgents = await r.smembers(`tvt:user_agents:${email}`)
  if (currentAgents.length >= MAX_AGENTS_PER_USER) return false

  // Atomic claim — SET NX returns true only if key didn't exist
  const claimed = await r.setnx(`tvt:agent_owner:${streamerName}`, email)
  if (!claimed) return false

  // Store hashed key + add to user's agent set + init stats as HASH
  const statsKey = `tvt:agent_stats:${streamerName}`
  await Promise.all([
    r.set(`tvt:agent_key:${streamerName}`, hashedApiKey),
    r.sadd(`tvt:user_agents:${email}`, streamerName),
    r.hset(statsKey, {
      total_broadcasts: 0,
      total_slides: 0,
      last_seen: new Date().toISOString(),
      peak_viewers: 0,
      total_votes: 0,
    }),
  ])

  return true
}

export async function getAgentOwner(streamerName: string): Promise<string | null> {
  return await getRedis().get<string>(`tvt:agent_owner:${streamerName}`)
}

export async function verifyAgentKey(streamerName: string, rawKey: string): Promise<boolean> {
  const storedHash = await getRedis().get<string>(`tvt:agent_key:${streamerName}`)
  if (!storedHash) return false
  return storedHash === hashToken(rawKey)
}

export async function getUserAgents(email: string): Promise<string[]> {
  return await getRedis().smembers(`tvt:user_agents:${email}`)
}

/**
 * Read agent stats from Redis HASH.
 * Supports both HASH (new) and JSON string (legacy) formats for backward compatibility.
 */
export async function getAgentStats(streamerName: string): Promise<AgentStats | null> {
  const r = getRedis()
  const key = `tvt:agent_stats:${streamerName}`

  // Try HASH format first (new schema)
  // Wrapped in try/catch because HGETALL throws WRONGTYPE if the key
  // is still stored as a JSON string (legacy format pre-migration).
  try {
    const hash = await r.hgetall<Record<string, string>>(key)
    if (hash && Object.keys(hash).length > 0) {
      return {
        total_broadcasts: Number(hash.total_broadcasts) || 0,
        total_slides: Number(hash.total_slides) || 0,
        last_seen: hash.last_seen || "",
        peak_viewers: Number(hash.peak_viewers) || 0,
        total_votes: Number(hash.total_votes) || 0,
      }
    }
  } catch {
    // WRONGTYPE — key exists as a string, fall through to legacy path
  }

  // Fallback: try legacy JSON string format
  const data = await r.get<string>(key)
  if (!data) return null
  return typeof data === "string" ? JSON.parse(data) : data
}

/**
 * Atomically migrate a legacy JSON string agent_stats key to a HASH.
 * Uses Lua script to prevent data loss if process crashes mid-migration.
 */
const MIGRATE_STATS_LUA = `
local key = KEYS[1]
local val = redis.call('GET', key)
if val == nil or val == false then return 0 end
local ok, data = pcall(cjson.decode, val)
if not ok then return 0 end
redis.call('DEL', key)
redis.call('HSET', key,
  'total_broadcasts', tonumber(data.total_broadcasts) or 0,
  'total_slides', tonumber(data.total_slides) or 0,
  'last_seen', data.last_seen or '',
  'peak_viewers', tonumber(data.peak_viewers) or 0,
  'total_votes', tonumber(data.total_votes) or 0)
return 1
`

async function migrateStatsToHash(r: Redis, key: string): Promise<boolean> {
  try {
    const result = await r.eval(MIGRATE_STATS_LUA, [key], [])
    return result === 1
  } catch {
    return false
  }
}

/**
 * Atomically increment broadcast + slide counters via HINCRBY.
 * No read-modify-write race — each op is atomic.
 * Auto-migrates legacy JSON string keys to HASH on first write.
 */
export async function incrementAgentStats(streamerName: string, slideCount: number): Promise<void> {
  const r = getRedis()
  const key = `tvt:agent_stats:${streamerName}`
  try {
    const pipeline = r.pipeline()
    pipeline.hincrby(key, "total_broadcasts", 1)
    pipeline.hincrby(key, "total_slides", slideCount)
    pipeline.hset(key, { last_seen: new Date().toISOString() })
    await pipeline.exec()
  } catch {
    // WRONGTYPE — legacy string key. Migrate then retry.
    await migrateStatsToHash(r, key)
    const pipeline = r.pipeline()
    pipeline.hincrby(key, "total_broadcasts", 1)
    pipeline.hincrby(key, "total_slides", slideCount)
    pipeline.hset(key, { last_seen: new Date().toISOString() })
    await pipeline.exec()
  }
}

/**
 * Atomically update peak viewers (max) and total votes (sum) after a broadcast.
 * Uses a pipeline: read current peak, then conditionally set if new peak is higher.
 */
/**
 * Atomically update peak viewers in a HASH using Lua.
 * Prevents race condition where concurrent calls lose the max value.
 */
const HASH_PEAK_LUA = `
local key = KEYS[1]
local new_peak = tonumber(ARGV[1])
local new_votes = tonumber(ARGV[2])
if new_votes > 0 then
  redis.call('HINCRBY', key, 'total_votes', new_votes)
end
local cur = tonumber(redis.call('HGET', key, 'peak_viewers') or '0')
if new_peak > cur then
  redis.call('HSET', key, 'peak_viewers', new_peak)
end
return 1
`

export async function updateAgentStreamStats(streamerName: string, peakViewers: number, totalVotes: number): Promise<void> {
  const r = getRedis()
  const key = `tvt:agent_stats:${streamerName}`

  try {
    await r.eval(HASH_PEAK_LUA, [key], [peakViewers, totalVotes])
  } catch {
    // WRONGTYPE — legacy string key. Migrate then retry.
    await migrateStatsToHash(r, key)
    await r.eval(HASH_PEAK_LUA, [key], [peakViewers, totalVotes])
  }
}

export async function revokeAgent(email: string, streamerName: string): Promise<void> {
  const r = getRedis()
  await Promise.all([
    r.del(`tvt:agent_owner:${streamerName}`),
    r.del(`tvt:agent_key:${streamerName}`),
    r.srem(`tvt:user_agents:${email}`, streamerName),
    // Keep stats — they're historical
  ])
}

export async function rotateAgentKey(streamerName: string, newHashedKey: string): Promise<void> {
  await getRedis().set(`tvt:agent_key:${streamerName}`, newHashedKey)
}

// ── Post History ──
// Agent post history is now stored in tvt:agent_posts:{name} sorted set (managed by kv.ts createPost).
// These functions are kept for backward compatibility with the dashboard but delegate to the new storage.
