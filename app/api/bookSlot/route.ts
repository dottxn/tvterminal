import { randomBytes } from "crypto"
import { signSlotJWT } from "@/lib/jwt"
import { getActiveSlot, setActiveSlot, pushToQueue, getQueue, setSlotMeta, setPendingBatch, setBatchMode, setBatchSlides, incrementFrameCount, setLastFrameType, setLastFrameTime, pushActivity } from "@/lib/kv"
import { publishToLive, publishToChat } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"
import { validateSlides } from "@/lib/types"
import type { ActiveSlot, QueuedSlot, SlotMeta, ValidatedSlide } from "@/lib/types"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, "write")
    if (rl.limited) return jsonResponse({ error: "rate_limited" }, 429, req)

    // Check config
    if (!process.env.ABLY_API_KEY) {
      return jsonResponse({ ok: false, error: "Ably not configured" }, 503, req)
    }
    if (!process.env.JWT_SECRET) {
      return jsonResponse({ ok: false, error: "JWT not configured" }, 503, req)
    }

    // Parse + validate
    const body = await req.json()
    const { streamer_name, streamer_url, duration_minutes, slides } = body as {
      streamer_name?: string
      streamer_url?: string
      duration_minutes?: number
      slides?: unknown[]
    }

    if (!streamer_name || typeof streamer_name !== "string" || !/^[\w.-]{1,50}$/.test(streamer_name)) {
      return jsonResponse({ ok: false, error: "streamer_name required (alphanumeric/underscore/dot/dash, 1-50 chars)" }, 400, req)
    }

    if (!streamer_url || typeof streamer_url !== "string") {
      return jsonResponse({ ok: false, error: "streamer_url required" }, 400, req)
    }

    try {
      new URL(streamer_url)
    } catch {
      return jsonResponse({ ok: false, error: "streamer_url must be a valid URL" }, 400, req)
    }

    const duration = Math.min(3, Math.max(1, Math.round(duration_minutes ?? 1)))

    // Validate slides if provided (book-with-content)
    let validatedSlides: ValidatedSlide[] | null = null
    let batchTotalDuration = 0

    if (slides && Array.isArray(slides) && slides.length > 0) {
      const result = validateSlides(slides)
      if ("error" in result) {
        return jsonResponse({ ok: false, error: result.error }, 400, req)
      }
      validatedSlides = result.slides
      batchTotalDuration = result.totalDuration
    }

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
      scheduledStart = now
      isImmediate = true
    } else if (activeSlot) {
      let endTime = Date.parse(activeSlot.slot_end)
      for (const q of queue) {
        endTime += q.duration_minutes * 60 * 1000
      }
      scheduledStart = new Date(endTime)
    } else {
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

    // Build response
    const response: Record<string, unknown> = {
      ok: true,
      slot_jwt: jwt,
      streamer_name,
      position_in_queue: isImmediate ? 0 : queue.length + 1,
      scheduled_start: scheduledStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      duration_minutes: duration,
      free: true,
    }

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

      // If slides provided, auto-play batch immediately
      if (validatedSlides) {
        const batchNow = Date.now()
        const batchEndAt = new Date(batchNow + batchTotalDuration * 1000)
        const newSlotEnd = new Date(batchEndAt.getTime() + 500)

        // Shorten slot to match batch
        if (newSlotEnd.getTime() < Date.parse(active.slot_end)) {
          active.slot_end = newSlotEnd.toISOString()
          await setActiveSlot(active)
        }

        await setBatchMode(slotId, batchEndAt.toISOString())
        await setBatchSlides(slotId, validatedSlides, batchNow)
        await incrementFrameCount(slotId)
        await setLastFrameType(slotId, validatedSlides[0].type)
        await setLastFrameTime(slotId)

        await publishToLive("batch", {
          slides: validatedSlides,
          total_duration_seconds: batchTotalDuration,
          slide_count: validatedSlides.length,
        })

        response.batch_queued = true
        response.slide_count = validatedSlides.length
        response.total_duration_seconds = batchTotalDuration
        response.batch_ends_at = batchEndAt.toISOString()
        response.slot_end = active.slot_end
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

      // If slides provided, store as pending batch for auto-play on promotion
      if (validatedSlides) {
        await setPendingBatch(slotId, validatedSlides)
        response.batch_queued = true
        response.slide_count = validatedSlides.length
        response.total_duration_seconds = batchTotalDuration
      }
    }

    // Publish activity entry
    try {
      const activityText = isImmediate ? "signed up and went live" : "signed up for the queue"
      await publishToChat("msg", { name: streamer_name, text: activityText, source: "system" })
      await pushActivity({ name: streamer_name, text: activityText, timestamp: Date.now() })
    } catch {
      // Best-effort — don't fail the booking for an activity message
    }

    return jsonResponse(response, 200, req)
  } catch (err) {
    console.error("[bookSlot]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
