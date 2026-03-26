import { getActiveSlot, getBatchMode, getBatchSlides, getRecentActivity } from "@/lib/kv"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    await checkAndTransitionSlots()

    const active = await getActiveSlot()
    if (!active) {
      return jsonResponse({ live: false }, 200, req)
    }

    // Base response
    const response: Record<string, unknown> = {
      live: true,
      streamer_name: active.streamer_name,
      streamer_url: active.streamer_url,
      slot_end: active.slot_end,
      started_at: active.started_at,
      frame_size: active.frame_size ?? "landscape",
    }

    // Check for active batch
    const batchEndAt = await getBatchMode(active.slot_id)
    if (batchEndAt) {
      const batchEnd = Date.parse(batchEndAt)
      const now = Date.now()
      if (now < batchEnd) {
        // Batch is still playing — include slides + timing
        const batchData = await getBatchSlides(active.slot_id)
        if (batchData) {
          response.batch = {
            slides: batchData.slides,
            started_at: batchData.started_at,
            ends_at: batchEndAt,
          }
        }
      }
    }

    // Include recent activity
    const activity = await getRecentActivity()
    response.activity = activity

    return jsonResponse(response, 200, req)
  } catch (err) {
    console.error("[currentBroadcast]", err)
    return jsonResponse({ live: false, error: "Internal error" }, 500, req)
  }
}
