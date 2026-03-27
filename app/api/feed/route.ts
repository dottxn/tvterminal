import { getFeedPosts } from "@/lib/kv"
import { optionsResponse, jsonResponse } from "@/lib/cors"

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limitParam = url.searchParams.get("limit")
    const beforeParam = url.searchParams.get("before")

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
    const before = beforeParam ? parseInt(beforeParam, 10) : undefined

    const posts = await getFeedPosts(limit, before)

    // Cursor for next page — timestamp of the oldest post returned
    const nextCursor = posts.length === limit && posts.length > 0
      ? Date.parse(posts[posts.length - 1].created_at)
      : null

    return jsonResponse({ posts, next_cursor: nextCursor }, 200, req)
  } catch (err) {
    console.error("[feed]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
