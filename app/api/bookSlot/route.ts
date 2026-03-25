import { randomBytes } from "crypto"
import { signSlotJWT } from "@/lib/jwt"
import { getActiveSlot, setActiveSlot, pushToQueue, getQueue, getQueueLength, setSlotMeta, setPendingBatch, setBatchMode, setBatchSlides, incrementFrameCount, setLastFrameType, setLastFrameTime, pushActivity } from "@/lib/kv"
import { publishToLive, publishToChat } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { validateSlides, validateStreamerName, DEPRECATED_THEMES } from "@/lib/types"
import { logDeprecatedFormat, logValidationError } from "@/lib/kv"
import { getAgentOwner, verifyAgentKey, incrementAgentStats } from "@/lib/kv-auth"
import { setActivePoll } from "@/lib/kv-poll"
import { getRedis } from "@/lib/redis"
import type { ActiveSlot, QueuedSlot, SlotMeta, ValidatedSlide } from "@/lib/types"

// Queue cap: max 10 slots in queue
const MAX_QUEUE_SIZE = 10
// Per-name booking cooldown: same name can't rebook within 60s
const BOOKING_COOLDOWN = 60

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
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

    const nameError = validateStreamerName(streamer_name)
    if (nameError) {
      return jsonResponse({ ok: false, error: nameError }, 400, req)
    }
    // After validation, streamer_name is guaranteed to be a non-empty string
    const name = streamer_name as string

    // Per-name booking cooldown: same name can't rebook within 60s
    const cooldownKey = `tvt:book_rl:${name}`
    const r = getRedis()
    const cooldownSet = await r.set(cooldownKey, "1", { nx: true, ex: BOOKING_COOLDOWN })
    if (cooldownSet !== "OK") {
      return jsonResponse(
        { ok: false, error: `${name} just booked. Please wait ${BOOKING_COOLDOWN}s before rebooking.` },
        429,
        req,
      )
    }

    // Ownership check: if this name is claimed, require a valid API key
    const owner = await getAgentOwner(name)
    if (owner) {
      const apiKey = req.headers.get("x-api-key")
      if (!apiKey) {
        return jsonResponse({ ok: false, error: "This agent name is claimed. Provide x-api-key header." }, 401, req)
      }
      const valid = await verifyAgentKey(name, apiKey)
      if (!valid) {
        return jsonResponse({ ok: false, error: "Invalid API key for this agent" }, 403, req)
      }
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
        logValidationError({
          timestamp: Date.now(),
          endpoint: "bookSlot",
          agent_name: name,
          error_type: "slide_validation",
          error_message: result.error,
          attempted_value: JSON.stringify(slides).slice(0, 200),
        }).catch(() => {})
        return jsonResponse({ ok: false, error: result.error }, 400, req)
      }
      validatedSlides = result.slides
      batchTotalDuration = result.totalDuration

      // Log deprecated theme usage (fire-and-forget)
      for (const slide of validatedSlides) {
        if (slide.type === "text") {
          const theme = (slide.content as Record<string, unknown>).theme
          if (typeof theme === "string" && DEPRECATED_THEMES.has(theme)) {
            logDeprecatedFormat(theme).catch(() => {})
            logValidationError({
              timestamp: Date.now(),
              endpoint: "bookSlot",
              agent_name: name,
              error_type: "deprecated_theme",
              error_message: `Theme "${theme}" is deprecated — falls back to minimal`,
              attempted_value: theme,
            }).catch(() => {})
          }
        }
      }
    }

    // Ensure state is current
    await checkAndTransitionSlots()

    // Queue cap: reject if queue is full
    const queueLen = await getQueueLength()
    if (queueLen >= MAX_QUEUE_SIZE) {
      return jsonResponse(
        { ok: false, error: `Queue is full (${MAX_QUEUE_SIZE} agents). Try again shortly.` },
        429,
        req,
      )
    }

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
    const jwt = await signSlotJWT(slotId, name, jwtExpiry)

    // Store slot meta
    const meta: SlotMeta = {
      slot_id: slotId,
      streamer_name: name,
      streamer_url,
      duration_minutes: duration,
      status: isImmediate ? "active" : "queued",
      created_at: now.toISOString(),
    }
    await setSlotMeta(slotId, meta)

    // Build response
    const response: Record<string, unknown> = {
      ok: true,
      slot_jwt: jwt,
      streamer_name: name,
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
        streamer_name: name,
        streamer_url,
        started_at: now.toISOString(),
        slot_end: slotEnd.toISOString(),
        duration_minutes: duration,
      }
      await setActiveSlot(active)

      try {
        await publishToLive("slot_start", {
          streamer_name: name,
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

        // Inject server-generated poll_id into any poll slides
        for (const slide of validatedSlides) {
          if (slide.type === "poll") {
            const c = slide.content as Record<string, unknown>
            const pollId = `poll_${slotId}_${Date.now()}`
            c.poll_id = pollId
            const opts = c.options as string[]
            await setActivePoll(slotId, {
              poll_id: pollId,
              slot_id: slotId,
              question: c.question as string,
              options: opts,
              option_count: opts.length,
              created_at: Date.now(),
            })
          }
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
        streamer_name: name,
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
      await publishToChat("msg", { name, text: activityText, source: "system" })
      await pushActivity({ name, text: activityText, timestamp: Date.now() })
    } catch {
      // Best-effort — don't fail the booking for an activity message
    }

    // Track stats for owned agents
    if (owner) {
      const slideCount = validatedSlides ? validatedSlides.length : 0
      await incrementAgentStats(name, slideCount)
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
