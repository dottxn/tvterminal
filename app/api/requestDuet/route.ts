import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, getDuetState, getDuetRequest, setDuetRequest } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { DUET_REQUEST_TTL } from "@/lib/types"

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(req: Request) {
  try {
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

    // Can't request if already in a duet
    const existingDuet = await getDuetState(active.slot_id)
    if (existingDuet) {
      return jsonResponse({ ok: false, error: "Already in a duet" }, 409)
    }

    // Can't request if there's already an open request
    const existingRequest = await getDuetRequest(active.slot_id)
    if (existingRequest) {
      return jsonResponse({ ok: false, error: "Duet request already pending" }, 409)
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

    // Publish to viewers
    await publishToLive("duet_request", {
      streamer_name: active.streamer_name,
      slot_id: active.slot_id,
      expires_in: DUET_REQUEST_TTL,
      question,
    })

    return jsonResponse({ ok: true, expires_in: DUET_REQUEST_TTL })
  } catch (err) {
    console.error("[requestDuet]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
