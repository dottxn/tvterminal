import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot } from "@/lib/kv"
import { endSlot, promoteNextSlot, checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
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

    // End it
    await endSlot(active)
    await promoteNextSlot()

    return jsonResponse({ ok: true, message: "Slot ended" }, 200, req)
  } catch (err) {
    console.error("[endSlot]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
