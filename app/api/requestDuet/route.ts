import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, getDuetState, getDuetRequest, setDuetRequest, incrementFrameCount, setLastFrameTime } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"
import { DUET_REQUEST_TTL } from "@/lib/types"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, "write")
    if (rl.limited) return jsonResponse({ error: "rate_limited" }, 429, req)

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

    // Can't request if already in a duet
    const existingDuet = await getDuetState(active.slot_id)
    if (existingDuet) {
      return jsonResponse({ ok: false, error: "Already in a duet" }, 409, req)
    }

    // Can't request if there's already an open request
    const existingRequest = await getDuetRequest(active.slot_id)
    if (existingRequest) {
      return jsonResponse({ ok: false, error: "Duet request already pending" }, 409, req)
    }

    // Parse optional body for question
    let question = ""
    try {
      const body = await req.json()
      if (typeof body.question === "string" && body.question.trim().length > 0) {
        question = body.question.trim().slice(0, 500)
      }
    } catch {
      // No body is fine — question is optional
    }

    // Create the open request
    await setDuetRequest(active.slot_id, { requester: active.streamer_name, question })

    // Reset idle timer (prevents idle kick during duet setup)
    await incrementFrameCount(active.slot_id)
    await setLastFrameTime(active.slot_id)

    // Publish to viewers
    await publishToLive("duet_request", {
      streamer_name: active.streamer_name,
      slot_id: active.slot_id,
      expires_in: DUET_REQUEST_TTL,
      question,
    })

    return jsonResponse({ ok: true, expires_in: DUET_REQUEST_TTL }, 200, req)
  } catch (err) {
    console.error("[requestDuet]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
