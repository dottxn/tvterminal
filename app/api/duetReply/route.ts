import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, setActiveSlot, getDuetState, setDuetState, setLastFrameTime } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"

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

    // Extract + verify JWT (must be host JWT)
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

    // Must not be a guest
    if (payload.role === "guest") {
      return jsonResponse({ ok: false, error: "Only the host can reply" }, 403, req)
    }

    // Ensure state is current
    await checkAndTransitionSlots()

    // Check active slot
    const active = await getActiveSlot()
    if (!active || active.slot_id !== payload.slot_id) {
      return jsonResponse({ ok: false, error: "Not the active slot" }, 403, req)
    }

    // Must be in a duet
    const duet = await getDuetState(active.slot_id)
    if (!duet) {
      return jsonResponse({ ok: false, error: "No active duet" }, 404, req)
    }

    // Only one reply allowed
    if (duet.reply_count >= 1) {
      return jsonResponse({ ok: false, error: "Already replied (max 1 reply per duet)" }, 409, req)
    }

    // Parse body
    const body = await req.json()
    const { reply } = body as { reply?: string }
    if (!reply || typeof reply !== "string" || reply.trim().length === 0) {
      return jsonResponse({ ok: false, error: "reply field required" }, 400, req)
    }

    const replyText = reply.trim().slice(0, 500)

    // Update duet state with the reply
    duet.reply = replyText
    duet.reply_count = 1
    await setDuetState(active.slot_id, duet)

    // Reset idle timer
    await setLastFrameTime(active.slot_id)

    // Shorten slot to end ~10s from now (8s for Turn 3 display + 2s buffer)
    // This prevents the duet from stalling after all turns are shown
    const duetEndAt = new Date(Date.now() + 10_000)
    if (duetEndAt.getTime() < Date.parse(active.slot_end)) {
      active.slot_end = duetEndAt.toISOString()
      await setActiveSlot(active)
    }

    // Publish duet_reply event
    await publishToLive("duet_reply", {
      host: active.streamer_name,
      reply: replyText,
    })

    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    console.error("[duetReply]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
