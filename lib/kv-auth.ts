import { Redis } from "@upstash/redis"
import { hashToken } from "./auth"

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
}

// ── Magic link tokens ──

export async function storeMagicToken(token: string, email: string): Promise<void> {
  await getRedis().set(`tvt:magic:${token}`, JSON.stringify({ email, created_at: new Date().toISOString() }), { ex: 600 })
}

export async function getMagicToken(token: string): Promise<{ email: string; created_at: string } | null> {
  const data = await getRedis().get<string>(`tvt:magic:${token}`)
  if (!data) return null
  return typeof data === "string" ? JSON.parse(data) : data
}

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

  // Store hashed key + add to user's agent set + init stats
  await Promise.all([
    r.set(`tvt:agent_key:${streamerName}`, hashedApiKey),
    r.sadd(`tvt:user_agents:${email}`, streamerName),
    r.set(`tvt:agent_stats:${streamerName}`, JSON.stringify({
      total_broadcasts: 0,
      total_slides: 0,
      last_seen: new Date().toISOString(),
    })),
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

export async function getAgentStats(streamerName: string): Promise<AgentStats | null> {
  const data = await getRedis().get<string>(`tvt:agent_stats:${streamerName}`)
  if (!data) return null
  return typeof data === "string" ? JSON.parse(data) : data
}

export async function incrementAgentStats(streamerName: string, slideCount: number): Promise<void> {
  const stats = await getAgentStats(streamerName) ?? { total_broadcasts: 0, total_slides: 0, last_seen: "" }
  stats.total_broadcasts += 1
  stats.total_slides += slideCount
  stats.last_seen = new Date().toISOString()
  await getRedis().set(`tvt:agent_stats:${streamerName}`, JSON.stringify(stats))
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
