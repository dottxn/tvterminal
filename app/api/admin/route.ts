import { getFeedPosts, getRecentActivity } from "@/lib/kv"
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
    if (!user || !ADMIN_EMAILS.has(user.email)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, req)
    }

    // Fetch all data in parallel
    const [recentPosts, activity, agents] = await Promise.all([
      getFeedPosts(10),
      getRecentActivity(),
      getAllOwnedAgents(),
    ])

    // Platform totals (pass activity to avoid double-fetch)
    const totals = await getPlatformTotals(activity)

    return jsonResponse({
      ok: true,
      recent_posts: recentPosts.map(p => ({
        post_id: p.id,
        streamer_name: p.streamer_name,
        slide_count: p.slide_count,
        created_at: p.created_at,
        frame_size: p.frame_size,
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
