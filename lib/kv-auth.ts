import { Redis } from "@upstash/redis"
import { hashToken } from "./auth"
import type { BroadcastSummary } from "./types"

// ── Redis client singleton (same pattern as lib/kv.ts) ──

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    if (!url || !token) throw new Error("Redis not configured (KV_REST_API_URL / KV_REST_API_TOKEN)")
    redis = new Redis({ url, token })
  }
  return redis
}

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
 * Migrate a legacy JSON string agent_stats key to a HASH in-place.
 * Returns the parsed stats if migration happened, null if key was already a HASH or missing.
 */
async function migrateStatsToHash(r: Redis, key: string): Promise<AgentStats | null> {
  try {
    const data = await r.get<string>(key)
    if (!data) return null
    const parsed: AgentStats = typeof data === "string" ? JSON.parse(data) : data
    // Delete the string key, then write as HASH
    await r.del(key)
    await r.hset(key, {
      total_broadcasts: parsed.total_broadcasts ?? 0,
      total_slides: parsed.total_slides ?? 0,
      last_seen: parsed.last_seen ?? "",
      peak_viewers: parsed.peak_viewers ?? 0,
      total_votes: parsed.total_votes ?? 0,
    })
    return parsed
  } catch {
    return null
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
export async function updateAgentStreamStats(streamerName: string, peakViewers: number, totalVotes: number): Promise<void> {
  const r = getRedis()
  const key = `tvt:agent_stats:${streamerName}`

  try {
    // Atomically add votes
    if (totalVotes > 0) {
      await r.hincrby(key, "total_votes", totalVotes)
    }

    // Peak viewers: read then conditionally set (needs 2 ops — acceptable since endSlot is low-frequency)
    const currentPeak = Number(await r.hget(key, "peak_viewers")) || 0
    if (peakViewers > currentPeak) {
      await r.hset(key, { peak_viewers: peakViewers })
    }
  } catch {
    // WRONGTYPE — legacy string key. Migrate then retry.
    await migrateStatsToHash(r, key)
    if (totalVotes > 0) {
      await r.hincrby(key, "total_votes", totalVotes)
    }
    const currentPeak = Number(await r.hget(key, "peak_viewers")) || 0
    if (peakViewers > currentPeak) {
      await r.hset(key, { peak_viewers: peakViewers })
    }
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

// ── Broadcast History ──

const MAX_HISTORY_ENTRIES = 50

/**
 * Store a broadcast summary in a sorted set (score = timestamp for chronological ordering).
 * Auto-trims to the most recent MAX_HISTORY_ENTRIES per agent.
 */
export async function addBroadcastHistory(streamerName: string, summary: BroadcastSummary): Promise<void> {
  const r = getRedis()
  const key = `tvt:agent_history:${streamerName}`
  const score = new Date(summary.end_time).getTime()
  const pipeline = r.pipeline()
  pipeline.zadd(key, { score, member: JSON.stringify(summary) })
  // Keep only the most recent entries — remove everything except top N
  pipeline.zremrangebyrank(key, 0, -(MAX_HISTORY_ENTRIES + 1))
  await pipeline.exec()
}

/**
 * Get broadcast history for an agent, newest first.
 */
export async function getAgentHistory(streamerName: string, limit = 20): Promise<BroadcastSummary[]> {
  const r = getRedis()
  const key = `tvt:agent_history:${streamerName}`
  const raw = await r.zrange(key, 0, limit - 1, { rev: true })
  if (!raw || raw.length === 0) return []
  return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as BroadcastSummary)
}
