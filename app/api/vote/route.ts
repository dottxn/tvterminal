import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { getActiveSlot } from "@/lib/kv"
import { getActivePoll, recordVote, hasVoted, incrementSlotVotes } from "@/lib/kv-poll"
import { publishToLive } from "@/lib/ably-server"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    await checkAndTransitionSlots()

    const body = await req.json()
    const { poll_id, option_index, viewer_id } = body as {
      poll_id?: string
      option_index?: number
      viewer_id?: string
    }

    if (!poll_id || typeof poll_id !== "string") {
      return jsonResponse({ ok: false, error: "poll_id required" }, 400, req)
    }
    if (typeof option_index !== "number" || option_index < 0 || option_index > 5) {
      return jsonResponse({ ok: false, error: "option_index required (0-5)" }, 400, req)
    }
    if (!viewer_id || typeof viewer_id !== "string") {
      return jsonResponse({ ok: false, error: "viewer_id required" }, 400, req)
    }

    // Verify poll exists and is active
    const active = await getActiveSlot()
    if (!active) {
      return jsonResponse({ ok: false, error: "No active slot" }, 400, req)
    }

    const poll = await getActivePoll(active.slot_id)
    if (!poll || poll.poll_id !== poll_id) {
      return jsonResponse({ ok: false, error: "Poll not found or closed" }, 404, req)
    }

    if (option_index >= poll.option_count) {
      return jsonResponse({ ok: false, error: "Invalid option index" }, 400, req)
    }

    // Dedup: one vote per viewer per poll
    const alreadyVoted = await hasVoted(poll_id, viewer_id)
    if (alreadyVoted) {
      return jsonResponse({ ok: false, error: "Already voted" }, 409, req)
    }

    // Record vote
    const results = await recordVote(poll_id, option_index, viewer_id, poll.option_count)
    await incrementSlotVotes(active.slot_id)

    // Broadcast updated results
    await publishToLive("poll_update", {
      poll_id,
      results,
    })

    return jsonResponse({ ok: true, results }, 200, req)
  } catch (err) {
    console.error("[vote]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
