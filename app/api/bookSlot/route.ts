import { randomBytes } from "crypto"
import { signSlotJWT } from "@/lib/jwt"
import { getActiveSlot, setActiveSlot, pushToQueue, getQueue, setSlotMeta } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import type { ActiveSlot, QueuedSlot, SlotMeta } from "@/lib/types"

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(req: Request) {
  try {
    // Check config
    if (!process.env.ABLY_API_KEY) {
      return jsonResponse({ ok: false, error: "Ably not configured" }, 503)
    }
    if (!process.env.JWT_SECRET) {
      return jsonResponse({ ok: false, error: "JWT not configured" }, 503)
    }

    // Parse + validate
    const body = await req.json()
    const { streamer_name, streamer_url, duration_minutes } = body as {
      streamer_name?: string
      streamer_url?: string
      duration_minutes?: number
    }

    if (!streamer_name || typeof streamer_name !== "string" || !/^[\w.-]{1,50}$/.test(streamer_name)) {
      return jsonResponse({ ok: false, error: "streamer_name required (alphanumeric/underscore/dot/dash, 1-50 chars)" }, 400)
    }

    if (!streamer_url || typeof streamer_url !== "string") {
      return jsonResponse({ ok: false, error: "streamer_url required" }, 400)
    }

    try {
      new URL(streamer_url)
    } catch {
      return jsonResponse({ ok: false, error: "streamer_url must be a valid URL" }, 400)
    }

    const duration = Math.min(3, Math.max(1, Math.round(duration_minutes ?? 1)))

    // Ensure state is current
    await checkAndTransitionSlots()

    // Generate slot ID
    const slotId = `slot_${Date.now()}_${randomBytes(4).toString("hex")}`

    // Check queue state
    const activeSlot = await getActiveSlot()
    const queue = await getQueue()

    const now = new Date()
    let scheduledStart: Date
    let isImmediate = false

    if (!activeSlot && queue.length === 0) {
      // Queue empty — start immediately
      scheduledStart = now
      isImmediate = true
    } else if (activeSlot) {
      // Someone is live — schedule after them + queued items
      let endTime = Date.parse(activeSlot.slot_end)
      for (const q of queue) {
        endTime += q.duration_minutes * 60 * 1000
      }
      scheduledStart = new Date(endTime)
    } else {
      // No active but queue exists (edge case) — schedule after queue
      let endTime = now.getTime()
      for (const q of queue) {
        endTime += q.duration_minutes * 60 * 1000
      }
      scheduledStart = new Date(endTime)
    }

    const slotEnd = new Date(scheduledStart.getTime() + duration * 60 * 1000)

    // Create JWT with 60s grace period past slot end
    const jwtExpiry = Math.floor(slotEnd.getTime() / 1000) + 60
    const jwt = await signSlotJWT(slotId, streamer_name, jwtExpiry)

    // Hash JWT for verification
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(jwt))
    const jwtHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")

    // Store slot meta
    const meta: SlotMeta = {
      slot_id: slotId,
      streamer_name,
      streamer_url,
      duration_minutes: duration,
      jwt_hash: jwtHash,
      status: isImmediate ? "active" : "queued",
      created_at: now.toISOString(),
    }
    await setSlotMeta(slotId, meta)

    if (isImmediate) {
      // Start broadcasting now
      const active: ActiveSlot = {
        slot_id: slotId,
        streamer_name,
        streamer_url,
        started_at: now.toISOString(),
        slot_end: slotEnd.toISOString(),
        duration_minutes: duration,
      }
      await setActiveSlot(active)

      try {
        await publishToLive("slot_start", {
          streamer_name,
          streamer_url,
          slot_end: slotEnd.toISOString(),
          type: "terminal",
        })
      } catch (err) {
        console.error("[bookSlot] Failed to publish slot_start:", err)
      }
    } else {
      // Queue it
      const queued: QueuedSlot = {
        slot_id: slotId,
        streamer_name,
        streamer_url,
        duration_minutes: duration,
        scheduled_start: scheduledStart.toISOString(),
        queued_at: now.toISOString(),
      }
      await pushToQueue(queued)
    }

    return jsonResponse({
      ok: true,
      slot_jwt: jwt,
      streamer_name,
      position_in_queue: isImmediate ? 0 : queue.length + 1,
      scheduled_start: scheduledStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      duration_minutes: duration,
      free: true,
    })
  } catch (err) {
    console.error("[bookSlot]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
