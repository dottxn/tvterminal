import { Redis } from "@upstash/redis"
import type { AgentStats } from "./kv-auth"
import { getAgentStats } from "./kv-auth"

// ── Redis client singleton (same pattern as kv.ts) ──

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

export interface OwnedAgent {
  name: string
  owner: string
  stats: AgentStats | null
}

export interface PlatformTotals {
  total_agents: number
  total_users: number
  broadcasts_today: number
}

// ── Admin Queries ──

/** Get all owned agents with their stats, sorted by total_broadcasts desc. */
export async function getAllOwnedAgents(): Promise<OwnedAgent[]> {
  const r = getRedis()
  const keys = await r.keys("tvt:agent_owner:*")
  if (!keys || keys.length === 0) return []

  const agents: OwnedAgent[] = []
  for (const key of keys) {
    const name = key.replace("tvt:agent_owner:", "")
    const owner = await r.get<string>(key)
    const stats = await getAgentStats(name)
    agents.push({ name, owner: owner ?? "unknown", stats })
  }

  // Sort by total broadcasts descending
  agents.sort((a, b) => (b.stats?.total_broadcasts ?? 0) - (a.stats?.total_broadcasts ?? 0))
  return agents
}

/** Get platform-wide totals. */
export async function getPlatformTotals(activityLog: Array<{ text: string; timestamp: number }>): Promise<PlatformTotals> {
  const r = getRedis()

  const [agentKeys, userKeys] = await Promise.all([
    r.keys("tvt:agent_owner:*"),
    r.keys("tvt:user:*"),
  ])

  // Count "went live" events from today in the activity log
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayMs = todayStart.getTime()

  const broadcastsToday = activityLog.filter(
    (e) => e.text === "went live" && e.timestamp >= todayMs,
  ).length

  return {
    total_agents: agentKeys?.length ?? 0,
    total_users: userKeys?.length ?? 0,
    broadcasts_today: broadcastsToday,
  }
}
