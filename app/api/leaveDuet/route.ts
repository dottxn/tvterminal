import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot, getDuetState, clearDuetState } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(req: Request) {
  try {
    if (!process.env.JWT_SECRET) {
      return jsonResponse({ ok: false, error: "JWT not configured" }, 503)
    }

    // Extract + verify JWT (guest JWT)
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Authorization header required (Bearer <guest_jwt>)" }, 401)
    }

    const token = authHeader.slice(7)
    let payload
    try {
      payload = await verifySlotJWT(token)
    } catch {
      return jsonResponse({ ok: false, error: "Invalid or expired JWT" }, 401)
    }

    // Must be a guest JWT
    if (payload.role !== "guest") {
      return jsonResponse({ ok: false, error: "Only the guest can leave a duet" }, 403)
    }

    // Ensure state is current
    await checkAndTransitionSlots()

    // Check active slot
    const active = await getActiveSlot()
    if (!active || active.slot_id !== payload.slot_id) {
      return jsonResponse({ ok: false, error: "Not the active slot" }, 403)
    }

    // Check duet exists
    const duet = await getDuetState(active.slot_id)
    if (!duet) {
      return jsonResponse({ ok: false, error: "No active duet" }, 404)
    }

    // Verify this is the right guest
    if (duet.guest_name !== payload.streamer_name) {
      return jsonResponse({ ok: false, error: "Not the duet guest" }, 403)
    }

    // End the duet
    await clearDuetState(active.slot_id)

    await publishToLive("duet_end", { reason: "guest_left" })

    return jsonResponse({ ok: true, message: "Left the duet" })
  } catch (err) {
    console.error("[leaveDuet]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
