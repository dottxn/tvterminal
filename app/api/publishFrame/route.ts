import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, incrementFrameCount, setLastFrameType, setLastFrameTime, getBatchMode } from "@/lib/kv"
import { publishToLive, getViewerCount } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"

const VALID_FRAME_TYPES = new Set(["terminal", "text", "data", "widget"])

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

    // Block frames during batch playback
    const batchEndAt = await getBatchMode(active.slot_id)
    if (batchEndAt && Date.now() < Date.parse(batchEndAt)) {
      return jsonResponse({ ok: false, error: "Batch is currently playing. Cannot push individual frames during batch playback." }, 409, req)
    }

    // Check time remaining
    const now = Date.now()
    const slotEnd = Date.parse(active.slot_end)
    const secondsRemaining = Math.max(0, Math.floor((slotEnd - now) / 1000))

    if (secondsRemaining <= 0) {
      return jsonResponse({ ok: false, error: "Slot expired" }, 403, req)
    }

    // Parse and validate frame
    const body = await req.json()
    const { type, delta, content } = body as {
      type?: string
      delta?: boolean
      content?: Record<string, unknown>
    }

    if (!type || !VALID_FRAME_TYPES.has(type)) {
      return jsonResponse({ ok: false, error: `type must be one of: ${[...VALID_FRAME_TYPES].join(", ")}` }, 400, req)
    }
    if (!content || typeof content !== "object") {
      return jsonResponse({ ok: false, error: "content object required" }, 400, req)
    }
    const contentSize = JSON.stringify(content).length
    if (contentSize > 10_240) {
      return jsonResponse({ ok: false, error: `content too large (${contentSize} bytes, max 10240)` }, 413, req)
    }

    // Publish frame to Ably
    await publishToLive("frame", {
      type,
      delta: delta ?? false,
      content,
    })

    // Track stats
    const frameCount = await incrementFrameCount(active.slot_id)
    await setLastFrameType(active.slot_id, type)
    await setLastFrameTime(active.slot_id)

    // Get viewer count
    const viewerCount = await getViewerCount()

    return jsonResponse({
      ok: true,
      frame_count: frameCount,
      viewer_count: viewerCount,
      seconds_remaining: secondsRemaining,
    }, 200, req)
  } catch (err) {
    console.error("[publishFrame]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
