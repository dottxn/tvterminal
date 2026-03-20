import { getActiveSlot, clearActiveSlot, popFromQueue, setActiveSlot, setSlotMeta, getSlotMeta } from "./kv"
import { publishToLive } from "./ably-server"
import type { ActiveSlot } from "./types"

/**
 * Check if the active slot has expired and handle transitions.
 * Called by every API route (check-on-access) and the cron job.
 */
export async function checkAndTransitionSlots(): Promise<void> {
  const active = await getActiveSlot()

  if (active) {
    const now = Date.now()
    const slotEnd = Date.parse(active.slot_end)

    if (now >= slotEnd) {
      // Slot has expired — end it and promote next
      await endSlot(active)
      await promoteNextSlot()
    }
  } else {
    // No active slot — check if there's something in the queue
    await promoteNextSlot()
  }
}

/**
 * End the current active slot — publish slot_end, clear KV, update meta.
 */
async function endSlot(slot: ActiveSlot): Promise<void> {
  try {
    await publishToLive("slot_end", {})
  } catch (err) {
    console.error("[slot-lifecycle] Failed to publish slot_end:", err)
  }

  // Update slot meta
  const meta = await getSlotMeta(slot.slot_id)
  if (meta) {
    meta.status = "completed"
    await setSlotMeta(slot.slot_id, meta)
  }

  await clearActiveSlot()
}

/**
 * Promote the next queued slot to active.
 */
async function promoteNextSlot(): Promise<void> {
  const next = await popFromQueue()
  if (!next) return

  const now = new Date()
  const slotEnd = new Date(now.getTime() + next.duration_minutes * 60 * 1000)

  const active: ActiveSlot = {
    slot_id: next.slot_id,
    streamer_name: next.streamer_name,
    streamer_url: next.streamer_url,
    started_at: now.toISOString(),
    slot_end: slotEnd.toISOString(),
    duration_minutes: next.duration_minutes,
  }

  await setActiveSlot(active)

  // Update slot meta
  const meta = await getSlotMeta(next.slot_id)
  if (meta) {
    meta.status = "active"
    await setSlotMeta(next.slot_id, meta)
  }

  // Publish slot_start — matches what use-broadcast.ts expects
  try {
    await publishToLive("slot_start", {
      streamer_name: active.streamer_name,
      streamer_url: active.streamer_url,
      slot_end: active.slot_end,
      type: "terminal", // default, updated as frames come in
    })
  } catch (err) {
    console.error("[slot-lifecycle] Failed to publish slot_start:", err)
  }
}
