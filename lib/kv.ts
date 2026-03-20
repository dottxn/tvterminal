import { Redis } from "@upstash/redis"
import type { ActiveSlot, QueuedSlot, SlotMeta } from "./types"

// ── Redis client singleton ──

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

// ── Active Slot ──

export async function getActiveSlot(): Promise<ActiveSlot | null> {
  const data = await getRedis().get<ActiveSlot>("tvt:active_slot")
  return data ?? null
}

export async function setActiveSlot(slot: ActiveSlot): Promise<void> {
  await getRedis().set("tvt:active_slot", JSON.stringify(slot))
}

export async function clearActiveSlot(): Promise<void> {
  await getRedis().del("tvt:active_slot")
}

// ── Queue (list) ──

export async function pushToQueue(slot: QueuedSlot): Promise<void> {
  await getRedis().rpush("tvt:queue", JSON.stringify(slot))
}

export async function popFromQueue(): Promise<QueuedSlot | null> {
  const raw = await getRedis().lpop<string>("tvt:queue")
  if (!raw) return null
  return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as QueuedSlot
}

export async function getQueue(): Promise<QueuedSlot[]> {
  const raw = await getRedis().lrange("tvt:queue", 0, -1)
  if (!raw || raw.length === 0) return []
  return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as QueuedSlot)
}

export async function getQueueLength(): Promise<number> {
  return await getRedis().llen("tvt:queue")
}

// ── Slot Metadata ──

export async function getSlotMeta(slotId: string): Promise<SlotMeta | null> {
  const data = await getRedis().get<SlotMeta>(`tvt:slot:${slotId}`)
  return data ?? null
}

export async function setSlotMeta(slotId: string, meta: SlotMeta): Promise<void> {
  // 1-hour TTL
  await getRedis().set(`tvt:slot:${slotId}`, JSON.stringify(meta), { ex: 3600 })
}

// ── Frame Tracking ──

export async function incrementFrameCount(slotId: string): Promise<number> {
  const key = `tvt:frames:${slotId}`
  const count = await getRedis().incr(key)
  // Set TTL on first frame
  if (count === 1) {
    await getRedis().expire(key, 3600)
  }
  return count
}

export async function getFrameCount(slotId: string): Promise<number> {
  const count = await getRedis().get<number>(`tvt:frames:${slotId}`)
  return count ?? 0
}

export async function setLastFrameType(slotId: string, type: string): Promise<void> {
  await getRedis().set(`tvt:last_type:${slotId}`, type, { ex: 3600 })
}

export async function getLastFrameType(slotId: string): Promise<string | null> {
  return await getRedis().get<string>(`tvt:last_type:${slotId}`)
}

// ── Idle Tracking ──

export async function setLastFrameTime(slotId: string): Promise<void> {
  await getRedis().set(`tvt:last_frame_at:${slotId}`, Date.now(), { ex: 3600 })
}

export async function getLastFrameTime(slotId: string): Promise<number | null> {
  const ts = await getRedis().get<number>(`tvt:last_frame_at:${slotId}`)
  return ts ?? null
}
