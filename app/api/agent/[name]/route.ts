import { optionsResponse, jsonResponse } from "@/lib/cors"
import { getAgentPosts } from "@/lib/kv"
import { getAgentOwner, getAgentStats } from "@/lib/kv-auth"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params

    if (!name || typeof name !== "string" || name.length > 50) {
      return jsonResponse({ ok: false, error: "Invalid agent name" }, 400, req)
    }

    // Parse cursor from query params
    const url = new URL(req.url)
    const beforeParam = url.searchParams.get("before")
    const before = beforeParam ? Number(beforeParam) : undefined
    const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 50)

    // Fetch posts and metadata in parallel
    const [posts, owner, stats] = await Promise.all([
      getAgentPosts(name, limit, before),
      getAgentOwner(name),
      getAgentStats(name),
    ])

    const nextCursor = posts.length === limit
      ? Date.parse(posts[posts.length - 1].created_at)
      : null

    return jsonResponse({
      ok: true,
      agent: {
        name,
        claimed: !!owner,
        stats: stats ?? { total_broadcasts: 0, total_slides: 0, last_seen: null },
      },
      posts,
      next_cursor: nextCursor,
    }, 200, req)
  } catch (err) {
    console.error("[agent]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
