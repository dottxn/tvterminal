import { signGuestJWT } from "@/lib/jwt"
import { getActiveSlot, getDuetState, getDuetRequest, deleteDuetRequest, setDuetState, setLastFrameTime, incrementFrameCount } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"

const NAME_RE = /^[\w.-]{1,50}$/

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(req: Request) {
  try {
    if (!process.env.JWT_SECRET) {
      return jsonResponse({ ok: false, error: "JWT not configured" }, 503)
    }

    // Parse body
    const body = await req.json()
    const { name, url, answer } = body as { name?: string; url?: string; answer?: string }

    if (!name || !NAME_RE.test(name)) {
      return jsonResponse({ ok: false, error: "name required (alphanumeric/underscore/dot/dash, 1-50 chars)" }, 400)
    }
    if (!url || typeof url !== "string") {
      return jsonResponse({ ok: false, error: "url required" }, 400)
    }
    try {
      new URL(url)
    } catch {
      return jsonResponse({ ok: false, error: "url must be a valid URL" }, 400)
    }

    const answerText = (typeof answer === "string" && answer.trim().length > 0)
      ? answer.trim().slice(0, 500)
      : ""

    // Ensure state is current
    await checkAndTransitionSlots()

    // Check active slot
    const active = await getActiveSlot()
    if (!active) {
      return jsonResponse({ ok: false, error: "No active slot" }, 404)
    }

    // Check there's an open duet request
    const request = await getDuetRequest(active.slot_id)
    if (!request) {
      return jsonResponse({ ok: false, error: "No duet request available" }, 404)
    }

    // Can't join your own duet
    if (name === active.streamer_name) {
      return jsonResponse({ ok: false, error: "Cannot duet with yourself" }, 400)
    }

    // Check no duet already active
    const existingDuet = await getDuetState(active.slot_id)
    if (existingDuet) {
      return jsonResponse({ ok: false, error: "Duet already in progress" }, 409)
    }

    // Accept the duet
    const duetState = {
      host_name: active.streamer_name,
      guest_name: name,
      guest_url: url,
      accepted_at: new Date().toISOString(),
      slot_id: active.slot_id,
      question: request.question || "",
      answer: answerText,
      reply_count: 0,
    }

    await setDuetState(active.slot_id, duetState)
    await deleteDuetRequest(active.slot_id)

    // Reset idle timer — duet counts as activity
    await setLastFrameTime(active.slot_id)
    await incrementFrameCount(active.slot_id)

    // Sign a guest JWT — same slot_id, expires with slot + 60s
    const slotEndUnix = Math.floor(Date.parse(active.slot_end) / 1000) + 60
    const guestJwt = await signGuestJWT(active.slot_id, name, slotEndUnix)

    // Publish duet start with conversation data
    await publishToLive("duet_start", {
      host: active.streamer_name,
      guest: name,
      guest_url: url,
      question: request.question || "",
      answer: answerText,
    })

    return jsonResponse({
      ok: true,
      guest_jwt: guestJwt,
      host: active.streamer_name,
      slot_end: active.slot_end,
    })
  } catch (err) {
    console.error("[acceptDuet]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
