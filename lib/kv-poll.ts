import { Redis } from "@upstash/redis"

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    if (!url || !token) throw new Error("Redis not configured")
    redis = new Redis({ url, token })
  }
  return redis
}

// ── Types ──

export interface ActivePollData {
  poll_id: string
  slot_id: string
  question: string
  options: string[]
  option_count: number
  created_at: number
}

// ── Active Poll (one per slot) ──

export async function setActivePoll(slotId: string, data: ActivePollData): Promise<void> {
  await getRedis().set(`tvt:active_poll:${slotId}`, JSON.stringify(data), { ex: 300 })
}

export async function getActivePoll(slotId: string): Promise<ActivePollData | null> {
  const raw = await getRedis().get<string>(`tvt:active_poll:${slotId}`)
  if (!raw) return null
  return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as ActivePollData
}

// ── Vote Recording ──

export async function recordVote(pollId: string, optionIndex: number, viewerId: string, optionCount: number): Promise<number[]> {
  const r = getRedis()
  // Mark viewer as voted
  await r.sadd(`tvt:poll_voters:${pollId}`, viewerId)
  await r.expire(`tvt:poll_voters:${pollId}`, 300)
  // Increment option count
  await r.hincrby(`tvt:poll_results:${pollId}`, String(optionIndex), 1)
  await r.expire(`tvt:poll_results:${pollId}`, 300)
  // Return all results
  return await getPollResults(pollId, optionCount)
}

export async function hasVoted(pollId: string, viewerId: string): Promise<boolean> {
  const result = await getRedis().sismember(`tvt:poll_voters:${pollId}`, viewerId)
  return result === 1
}

export async function getPollResults(pollId: string, optionCount: number): Promise<number[]> {
  const hash = await getRedis().hgetall(`tvt:poll_results:${pollId}`)
  const results: number[] = []
  for (let i = 0; i < optionCount; i++) {
    results.push(Number(hash?.[String(i)] ?? 0))
  }
  return results
}

// ── Slot-Level Vote Tracking ──

export async function incrementSlotVotes(slotId: string): Promise<void> {
  const r = getRedis()
  await r.incr(`tvt:slot_votes:${slotId}`)
  await r.expire(`tvt:slot_votes:${slotId}`, 3600)
}

export async function getSlotTotalVotes(slotId: string): Promise<number> {
  return (await getRedis().get<number>(`tvt:slot_votes:${slotId}`)) ?? 0
}
