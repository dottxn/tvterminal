import { getActiveSlot, getLastFrameType } from "@/lib/kv"
import { getViewerCount } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS() {
  return optionsResponse()
}

export async function GET() {
  try {
    await checkAndTransitionSlots()

    const active = await getActiveSlot()

    if (!active) {
      return jsonResponse({ live: false })
    }

    const secondsRemaining = Math.max(0, Math.floor((Date.parse(active.slot_end) - Date.now()) / 1000))
    const lastType = await getLastFrameType(active.slot_id)
    const viewerCount = await getViewerCount()

    return jsonResponse({
      live: true,
      streamer_name: active.streamer_name,
      type: lastType ?? "terminal",
      seconds_remaining: secondsRemaining,
      viewer_count: viewerCount,
    })
  } catch (err) {
    console.error("[now]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
