import { getAuthUser } from "@/lib/auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { getValidationErrors } from "@/lib/kv"
import { getRedis } from "@/lib/redis"
import type { BroadcastContentMetadata } from "@/lib/types"

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean),
)

// ── 30s server-side cache ──
// Avoids 15+ Redis round-trips on every 30s auto-refresh.
let cachedResponse: { data: Record<string, unknown>; expires: number } | null = null
const CACHE_TTL_MS = 30_000

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user || !ADMIN_EMAILS.has(user.email)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, req)
    }

    // Return cached response if fresh
    if (cachedResponse && Date.now() < cachedResponse.expires) {
      return jsonResponse(cachedResponse.data, 200, req)
    }

    const r = getRedis()

    // Scan for broadcast content metadata keys (7-day window)
    const contentKeys: string[] = []
    let cursor = 0
    do {
      const [nextCursor, keys] = await r.scan(cursor, { match: "tvt:broadcast_content:*", count: 100 })
      cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor
      if (keys) contentKeys.push(...keys)
    } while (cursor !== 0)

    // Fetch broadcast content metadata in batches using MGET (fixes N+1)
    const broadcasts: BroadcastContentMetadata[] = []
    const BATCH_SIZE = 50
    for (let i = 0; i < contentKeys.length; i += BATCH_SIZE) {
      const batch = contentKeys.slice(i, i + BATCH_SIZE)
      const results = await r.mget<(BroadcastContentMetadata | null)[]>(...batch)
      for (const result of results) {
        if (result) broadcasts.push(result)
      }
    }

    // Sort by ended_at desc, take top 20
    broadcasts.sort((a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime())
    const recentBroadcasts = broadcasts.slice(0, 20)

    // Aggregate format + theme stats across all recent broadcasts
    const formatStats: Record<string, number> = {}
    const themeStats: Record<string, number> = {}
    for (const bc of broadcasts) {
      for (const [fmt, count] of Object.entries(bc.format_usage)) {
        formatStats[fmt] = (formatStats[fmt] ?? 0) + count
      }
      for (const [theme, count] of Object.entries(bc.theme_usage)) {
        themeStats[theme] = (themeStats[theme] ?? 0) + count
      }
    }

    // Get validation errors
    const validationErrors = await getValidationErrors(50)

    // Get deprecated format counters from Redis (also batched via MGET)
    const deprecatedKeys: string[] = []
    let dCursor = 0
    do {
      const [nextCursor, keys] = await r.scan(dCursor, { match: "tvt:deprecated_format:*", count: 100 })
      dCursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor
      if (keys) deprecatedKeys.push(...keys)
    } while (dCursor !== 0)

    const deprecatedFormats: Record<string, number> = {}
    if (deprecatedKeys.length > 0) {
      const counts = await r.mget<(number | null)[]>(...deprecatedKeys)
      for (let i = 0; i < deprecatedKeys.length; i++) {
        const name = deprecatedKeys[i].replace("tvt:deprecated_format:", "")
        const count = counts[i]
        if (count) deprecatedFormats[name] = count
      }
    }

    const data = {
      ok: true,
      recent_broadcasts: recentBroadcasts,
      validation_errors: validationErrors,
      format_stats: formatStats,
      theme_stats: themeStats,
      deprecated_formats: deprecatedFormats,
      total_broadcasts: broadcasts.length,
    }

    // Cache the response
    cachedResponse = { data, expires: Date.now() + CACHE_TTL_MS }

    return jsonResponse(data, 200, req)
  } catch (err) {
    console.error("[admin/insights]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
