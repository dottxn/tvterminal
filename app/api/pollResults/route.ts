import { verifySlotJWT } from "@/lib/jwt"
import { getActiveSlot } from "@/lib/kv"
import { getActivePoll, getPollResults } from "@/lib/kv-poll"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    // JWT auth (same as publishFrame)
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Authorization required" }, 401, req)
    }

    let payload
    try {
      payload = await verifySlotJWT(authHeader.slice(7))
    } catch {
      return jsonResponse({ ok: false, error: "Invalid or expired JWT" }, 401, req)
    }

    const active = await getActiveSlot()
    if (!active || active.slot_id !== payload.slot_id) {
      return jsonResponse({ ok: false, error: "Not the active slot" }, 403, req)
    }

    const poll = await getActivePoll(active.slot_id)
    if (!poll) {
      return jsonResponse({ ok: true, active: false }, 200, req)
    }

    const results = await getPollResults(poll.poll_id, poll.option_count)
    const totalVotes = results.reduce((a, b) => a + b, 0)

    return jsonResponse({
      ok: true,
      active: true,
      poll_id: poll.poll_id,
      question: poll.question,
      options: poll.options,
      results,
      total_votes: totalVotes,
    }, 200, req)
  } catch (err) {
    console.error("[pollResults]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
