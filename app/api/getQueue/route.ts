import { getActiveSlot, getQueue } from "@/lib/kv"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    await checkAndTransitionSlots()

    const rl = await rateLimit(req, "read")
    if (rl.limited) return jsonResponse({ error: "rate_limited" }, 429, req)

    const active = await getActiveSlot()
    const queue = await getQueue()

    let live = null
    if (active) {
      const secondsRemaining = Math.max(0, Math.floor((Date.parse(active.slot_end) - Date.now()) / 1000))
      live = {
        streamer_name: active.streamer_name,
        seconds_remaining: secondsRemaining,
        slot_end: active.slot_end,
      }
    }

    return jsonResponse({
      live,
      queue: queue.map((q, i) => ({
        position: i + 1,
        streamer_name: q.streamer_name,
        scheduled_start: q.scheduled_start,
        duration_minutes: q.duration_minutes,
      })),
    }, 200, req)
  } catch (err) {
    console.error("[getQueue]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
