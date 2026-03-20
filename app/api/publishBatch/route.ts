import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, setActiveSlot, incrementFrameCount, setLastFrameType, setLastFrameTime, getBatchMode, setBatchMode } from "@/lib/kv"
import { publishToLive, getViewerCount } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { DEFAULT_SLIDE_DURATION, MAX_SLIDES, MAX_SLIDE_DURATION, MIN_SLIDE_DURATION } from "@/lib/types"

const VALID_FRAME_TYPES = new Set(["terminal", "text", "data", "widget"])

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

    // Extract + verify JWT
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Authorization header required (Bearer <slot_jwt>)" }, 401)
    }

    const token = authHeader.slice(7)
    let payload
    try {
      payload = await verifySlotJWT(token)
    } catch {
      return jsonResponse({ ok: false, error: "Invalid or expired JWT" }, 401)
    }

    // Ensure state is current
    await checkAndTransitionSlots()

    // Check this slot is the active one
    const active = await getActiveSlot()
    if (!active || active.slot_id !== payload.slot_id) {
      return jsonResponse({ ok: false, error: "Not the active slot" }, 403)
    }

    // Check if already in batch mode
    const existingBatch = await getBatchMode(active.slot_id)
    if (existingBatch && Date.now() < Date.parse(existingBatch)) {
      return jsonResponse({ ok: false, error: "Batch already playing. Wait for it to finish." }, 409)
    }

    // Parse and validate slides
    const body = await req.json()
    const { slides } = body as { slides?: unknown[] }

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return jsonResponse({ ok: false, error: "slides array required (1-10 items)" }, 400)
    }
    if (slides.length > MAX_SLIDES) {
      return jsonResponse({ ok: false, error: `Maximum ${MAX_SLIDES} slides allowed` }, 400)
    }

    // Validate each slide and compute durations
    const validatedSlides: Array<{ type: string; content: Record<string, unknown>; duration_seconds: number }> = []
    let totalDuration = 0

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i] as { type?: string; content?: Record<string, unknown>; duration_seconds?: number }

      if (!slide.type || !VALID_FRAME_TYPES.has(slide.type)) {
        return jsonResponse({ ok: false, error: `Slide ${i}: type must be one of: ${[...VALID_FRAME_TYPES].join(", ")}` }, 400)
      }
      if (!slide.content || typeof slide.content !== "object") {
        return jsonResponse({ ok: false, error: `Slide ${i}: content object required` }, 400)
      }

      const defaultDuration = DEFAULT_SLIDE_DURATION[slide.type] ?? 8
      const duration = Math.min(MAX_SLIDE_DURATION, Math.max(MIN_SLIDE_DURATION, Math.round(slide.duration_seconds ?? defaultDuration)))

      validatedSlides.push({ type: slide.type, content: slide.content, duration_seconds: duration })
      totalDuration += duration
    }

    // Shorten the slot to match batch duration + 3s buffer
    const now = Date.now()
    const batchEndAt = new Date(now + totalDuration * 1000)
    const newSlotEnd = new Date(batchEndAt.getTime() + 3000) // 3s buffer

    // Only shorten, never extend
    const originalSlotEnd = Date.parse(active.slot_end)
    if (newSlotEnd.getTime() < originalSlotEnd) {
      active.slot_end = newSlotEnd.toISOString()
      await setActiveSlot(active)
    }

    // Set batch mode in Redis
    await setBatchMode(active.slot_id, batchEndAt.toISOString())

    // Track stats
    await incrementFrameCount(active.slot_id)
    await setLastFrameType(active.slot_id, validatedSlides[0].type)
    await setLastFrameTime(active.slot_id)

    // Publish batch event to Ably
    await publishToLive("batch", {
      slides: validatedSlides,
      total_duration_seconds: totalDuration,
      slide_count: validatedSlides.length,
    })

    const viewerCount = await getViewerCount()

    return jsonResponse({
      ok: true,
      slide_count: validatedSlides.length,
      total_duration_seconds: totalDuration,
      viewer_count: viewerCount,
      batch_ends_at: batchEndAt.toISOString(),
      slot_end: active.slot_end,
    })
  } catch (err) {
    console.error("[publishBatch]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
