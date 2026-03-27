import { getFeedPosts } from "@/lib/kv"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const posts = await getFeedPosts(1)
    const latest = posts[0] || null

    return jsonResponse({
      has_posts: !!latest,
      latest: latest ? {
        post_id: latest.id,
        streamer_name: latest.streamer_name,
        slide_count: latest.slide_count,
        created_at: latest.created_at,
      } : null,
    }, 200, req)
  } catch (err) {
    console.error("[now]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
