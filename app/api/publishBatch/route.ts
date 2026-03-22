import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, setActiveSlot, incrementFrameCount, setLastFrameType, setLastFrameTime, getBatchMode, setBatchMode, setBatchSlides } from "@/lib/kv"
import { publishToLive, getViewerCount } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"
import { validateSlides } from "@/lib/types"

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

    // Extract + verify JWT
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Authorization header required (Bearer <slot_jwt>)" }, 401, req)
    }

    const token = authHeader.slice(7)
    let payload
    try {
      payload = await verifySlotJWT(token)
    } catch {
      return jsonResponse({ ok: false, error: "Invalid or expired JWT" }, 401, req)
    }

    // Ensure state is current
    await checkAndTransitionSlots()

    // Check this slot is the active one
    const active = await getActiveSlot()
    if (!active || active.slot_id !== payload.slot_id) {
      return jsonResponse({ ok: false, error: "Not the active slot" }, 403, req)
    }

    // Check if already in batch mode
    const existingBatch = await getBatchMode(active.slot_id)
    if (existingBatch && Date.now() < Date.parse(existingBatch)) {
      return jsonResponse({ ok: false, error: "Batch already playing. Wait for it to finish." }, 409, req)
    }

    // Parse and validate slides
    const body = await req.json()
    const { slides } = body as { slides?: unknown[] }

    if (!slides) {
      return jsonResponse({ ok: false, error: "slides array required" }, 400, req)
    }

    const result = validateSlides(slides)
    if ("error" in result) {
      return jsonResponse({ ok: false, error: result.error }, 400, req)
    }

    const { slides: validatedSlides, totalDuration } = result

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

    // Store slides so late-joining clients can reconstruct state
    await setBatchSlides(active.slot_id, validatedSlides, now)

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
    }, 200, req)
  } catch (err) {
    console.error("[publishBatch]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
