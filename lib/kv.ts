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

// ── Distributed Lock ──
// Prevents concurrent checkAndTransitionSlots from racing

export async function acquireTransitionLock(): Promise<boolean> {
  // SET NX with 15s TTL — only one caller wins
  // Needs to be long enough for the full promote cycle (multiple Redis + Ably calls)
  const result = await getRedis().set("tvt:transition_lock", "1", { nx: true, ex: 15 })
  return result === "OK"
}

export async function releaseTransitionLock(): Promise<void> {
  await getRedis().del("tvt:transition_lock")
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

// ── Batch Mode ──

export async function setBatchMode(slotId: string, batchEndAt: string): Promise<void> {
  await getRedis().set(`tvt:batch_end:${slotId}`, batchEndAt, { ex: 3600 })
}

export async function getBatchMode(slotId: string): Promise<string | null> {
  return await getRedis().get<string>(`tvt:batch_end:${slotId}`)
}

// Store batch slides so late-joining clients can reconstruct state
export async function setBatchSlides(slotId: string, slides: unknown[], startedAt: number): Promise<void> {
  await getRedis().set(`tvt:batch_slides:${slotId}`, JSON.stringify({ slides, started_at: startedAt }), { ex: 3600 })
}

export async function getBatchSlides(slotId: string): Promise<{ slides: unknown[]; started_at: number } | null> {
  const data = await getRedis().get<{ slides: unknown[]; started_at: number }>(`tvt:batch_slides:${slotId}`)
  return data ?? null
}

// ── Pending Batch (slides submitted at booking time) ──

export async function setPendingBatch(slotId: string, slides: unknown[]): Promise<void> {
  await getRedis().set(`tvt:pending_batch:${slotId}`, JSON.stringify(slides), { ex: 3600 })
}

export async function getPendingBatch(slotId: string): Promise<unknown[] | null> {
  const data = await getRedis().get<unknown[]>(`tvt:pending_batch:${slotId}`)
  return data ?? null
}

export async function deletePendingBatch(slotId: string): Promise<void> {
  await getRedis().del(`tvt:pending_batch:${slotId}`)
}

// ── Duets (pre-recorded, queue-based) ──

export async function createDuetRequest(request: import("./types").DuetRequest): Promise<void> {
  await getRedis().set(`tvt:duet_request:${request.id}`, JSON.stringify(request), { ex: 3600 })
  await getRedis().sadd("tvt:duet_requests_open", request.id)
}

export async function getDuetRequestById(id: string): Promise<import("./types").DuetRequest | null> {
  const data = await getRedis().get<import("./types").DuetRequest>(`tvt:duet_request:${id}`)
  return data ?? null
}

export async function deleteDuetRequestById(id: string): Promise<void> {
  await getRedis().del(`tvt:duet_request:${id}`)
  await getRedis().srem("tvt:duet_requests_open", id)
}

export async function listOpenDuetRequests(): Promise<import("./types").DuetRequest[]> {
  const ids = await getRedis().smembers("tvt:duet_requests_open")
  if (!ids || ids.length === 0) return []
  const requests: import("./types").DuetRequest[] = []
  for (const id of ids) {
    const req = await getDuetRequestById(id as string)
    if (req) {
      requests.push(req)
    } else {
      // TTL expired — clean up stale set member
      await getRedis().srem("tvt:duet_requests_open", id)
    }
  }
  return requests
}

export async function createDuetPending(pending: import("./types").DuetPending): Promise<void> {
  await getRedis().set(`tvt:duet_pending:${pending.id}`, JSON.stringify(pending), { ex: 3600 })
}

export async function getDuetPendingById(id: string): Promise<import("./types").DuetPending | null> {
  const data = await getRedis().get<import("./types").DuetPending>(`tvt:duet_pending:${id}`)
  return data ?? null
}

export async function deleteDuetPendingById(id: string): Promise<void> {
  await getRedis().del(`tvt:duet_pending:${id}`)
}

// ── Peak Viewers Tracking ──

export async function updatePeakViewers(slotId: string, count: number): Promise<void> {
  const r = getRedis()
  const key = `tvt:peak_viewers:${slotId}`
  const current = await r.get<number>(key)
  if (current === null || count > current) {
    await r.set(key, count, { ex: 3600 })
  }
}

export async function getPeakViewers(slotId: string): Promise<number> {
  return (await getRedis().get<number>(`tvt:peak_viewers:${slotId}`)) ?? 0
}

// ── Activity Log (persistent) ──

export async function pushActivity(entry: import("./types").ActivityEntry): Promise<void> {
  await getRedis().lpush("tvt:activity", JSON.stringify(entry))
  await getRedis().ltrim("tvt:activity", 0, 49) // keep last 50
}

export async function getRecentActivity(): Promise<import("./types").ActivityEntry[]> {
  const raw = await getRedis().lrange("tvt:activity", 0, 49)
  if (!raw || raw.length === 0) return []
  return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as import("./types").ActivityEntry)
}
