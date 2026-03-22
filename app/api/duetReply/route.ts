import { getDuetPendingById, deleteDuetPendingById, pushActivity, getActiveSlot, getQueue, pushToQueue, setActiveSlot, setSlotMeta, setPendingBatch, setBatchMode, setBatchSlides, setLastFrameTime } from "@/lib/kv"
import { publishToLive, publishToChat } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"
import type { ActiveSlot, QueuedSlot, SlotMeta, ValidatedSlide } from "@/lib/types"

const NAME_RE = /^[a-zA-Z0-9_.\-]+$/

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, "write")
    if (rl.limited) return jsonResponse({ error: "rate_limited" }, 429, req)

    const body = await req.json()
    const { request_id, name, reply } = body as {
      request_id?: string
      name?: string
      reply?: string
    }

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      return jsonResponse({ ok: false, error: "request_id required" }, 400, req)
    }

    // Validate name
    if (!name || typeof name !== "string" || name.length < 1 || name.length > 50 || !NAME_RE.test(name)) {
      return jsonResponse({ ok: false, error: "name required (alphanumeric/underscore/dot/dash, 1-50 chars)" }, 400, req)
    }

    // Validate reply
    if (!reply || typeof reply !== "string" || reply.trim().length < 1 || reply.trim().length > 500) {
      return jsonResponse({ ok: false, error: "reply required (1-500 chars)" }, 400, req)
    }

    // Fetch the pending duet
    const pending = await getDuetPendingById(request_id)
    if (!pending) {
      return jsonResponse({ ok: false, error: "Pending duet not found" }, 404, req)
    }

    // Only the host can reply
    if (name !== pending.host_name) {
      return jsonResponse({ ok: false, error: "Only the host can reply" }, 403, req)
    }

    // Build the 3 duet slides
    const slides: ValidatedSlide[] = [
      {
        type: "duet",
        content: {
          turn: 1,
          speaker_name: pending.host_name,
          speaker_role: "host",
          text: pending.question,
          host_name: pending.host_name,
          guest_name: pending.guest_name,
        },
        duration_seconds: 8,
      },
      {
        type: "duet",
        content: {
          turn: 2,
          speaker_name: pending.guest_name,
          speaker_role: "guest",
          text: pending.answer,
          host_name: pending.host_name,
          guest_name: pending.guest_name,
        },
        duration_seconds: 8,
      },
      {
        type: "duet",
        content: {
          turn: 3,
          speaker_name: pending.host_name,
          speaker_role: "host",
          text: reply.trim(),
          host_name: pending.host_name,
          guest_name: pending.guest_name,
        },
        duration_seconds: 8,
      },
    ]

    // Auto-book a slot
    await checkAndTransitionSlots()

    const slot_id = `duet_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const streamer_name = pending.host_name
    const streamer_url = pending.host_url
    const totalDurationMs = 24_000 // 3 slides x 8s
    const duration_minutes = 1

    const activeSlot = await getActiveSlot()
    const queue = await getQueue()
    let position: number

    if (!activeSlot && queue.length === 0) {
      // Go live immediately
      const now = new Date()
      const batchEndAt = Date.now() + totalDurationMs + 500
      const slotEnd = new Date(batchEndAt)

      const active: ActiveSlot = {
        slot_id,
        streamer_name,
        streamer_url,
        started_at: now.toISOString(),
        slot_end: slotEnd.toISOString(),
        duration_minutes,
      }
      await setActiveSlot(active)

      const meta: SlotMeta = {
        slot_id,
        streamer_name,
        streamer_url,
        duration_minutes,
        jwt_hash: "",
        status: "active",
        created_at: now.toISOString(),
      }
      await setSlotMeta(slot_id, meta)

      // Auto-play the batch immediately
      await setBatchMode(slot_id, new Date(batchEndAt).toISOString())
      await setBatchSlides(slot_id, slides, Date.now())
      await setLastFrameTime(slot_id)

      // Publish slot_start and batch
      await publishToLive("slot_start", { slot_id, streamer_name, streamer_url })
      await publishToLive("batch", { slides, started_at: Date.now(), ends_at: batchEndAt })

      // Activity: went live
      await pushActivity({ name: streamer_name, text: "went live", timestamp: Date.now() })

      position = 0
    } else {
      // Queue it
      let scheduledStart: Date
      if (activeSlot) {
        let endTime = Date.parse(activeSlot.slot_end)
        for (const q of queue) {
          endTime += q.duration_minutes * 60 * 1000
        }
        scheduledStart = new Date(endTime)
      } else {
        let endTime = Date.now()
        for (const q of queue) {
          endTime += q.duration_minutes * 60 * 1000
        }
        scheduledStart = new Date(endTime)
      }

      const queued: QueuedSlot = {
        slot_id,
        streamer_name,
        streamer_url,
        duration_minutes,
        scheduled_start: scheduledStart.toISOString(),
        queued_at: new Date().toISOString(),
      }
      await pushToQueue(queued)

      const meta: SlotMeta = {
        slot_id,
        streamer_name,
        streamer_url,
        duration_minutes,
        jwt_hash: "",
        status: "queued",
        created_at: new Date().toISOString(),
      }
      await setSlotMeta(slot_id, meta)

      // Store pending batch for auto-play on promotion
      await setPendingBatch(slot_id, slides)

      position = queue.length + 1
    }

    // Delete the pending duet
    await deleteDuetPendingById(request_id)

    // Activity: completed a duet
    const activityText = `completed a duet with ${pending.guest_name}`
    await publishToChat("msg", { name: streamer_name, text: activityText, source: "system", timestamp: Date.now() })
    await pushActivity({ name: streamer_name, text: activityText, timestamp: Date.now() })

    return jsonResponse({ ok: true, slot_id, position_in_queue: position }, 200, req)
  } catch (err) {
    console.error("[duetReply]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
