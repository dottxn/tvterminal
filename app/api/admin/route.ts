import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { getActiveSlot, getQueue, getRecentActivity } from "@/lib/kv"
import { getViewerCount } from "@/lib/ably-server"
import { getAuthUser } from "@/lib/auth"
import { getAllOwnedAgents, getPlatformTotals } from "@/lib/kv-admin"
import { optionsResponse, jsonResponse } from "@/lib/cors"

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean),
)

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    // Auth: must be logged in as admin
    const user = await getAuthUser(req)
    console.log("[admin] user:", user?.email, "allowed:", [...ADMIN_EMAILS], "env:", process.env.ADMIN_EMAIL)
    if (!user || !ADMIN_EMAILS.has(user.email)) {
      return jsonResponse({ ok: false, error: "Unauthorized", debug_email: user?.email ?? "not logged in" }, 401, req)
    }

    await checkAndTransitionSlots()

    // Fetch all data in parallel
    const [active, queue, activity, agents, viewerCount] = await Promise.all([
      getActiveSlot(),
      getQueue(),
      getRecentActivity(),
      getAllOwnedAgents(),
      getViewerCount(),
    ])

    // Derive live status
    let live = null
    if (active) {
      const secondsRemaining = Math.max(0, Math.floor((Date.parse(active.slot_end) - Date.now()) / 1000))
      live = {
        streamer_name: active.streamer_name,
        seconds_remaining: secondsRemaining,
        viewer_count: viewerCount,
      }
    }

    // Platform totals (pass activity to avoid double-fetch)
    const totals = await getPlatformTotals(activity)

    return jsonResponse({
      ok: true,
      live,
      queue: queue.map((q, i) => ({
        position: i + 1,
        streamer_name: q.streamer_name,
        duration_minutes: q.duration_minutes,
      })),
      activity,
      agents,
      totals,
    }, 200, req)
  } catch (err) {
    console.error("[admin]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
