import { getAuthUser } from "@/lib/auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { getValidationErrors, getBroadcastContent } from "@/lib/kv"
import { Redis } from "@upstash/redis"
import type { BroadcastContentMetadata } from "@/lib/types"

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean),
)

let redis: Redis | null = null
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return redis
}

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user || !ADMIN_EMAILS.has(user.email)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, req)
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

    // Fetch broadcast content metadata
    const broadcasts: BroadcastContentMetadata[] = []
    for (const key of contentKeys) {
      const slotId = key.replace("tvt:broadcast_content:", "")
      const content = await getBroadcastContent(slotId)
      if (content) broadcasts.push(content)
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

    // Get deprecated format counters from Redis
    const deprecatedKeys: string[] = []
    let dCursor = 0
    do {
      const [nextCursor, keys] = await r.scan(dCursor, { match: "tvt:deprecated_format:*", count: 100 })
      dCursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor
      if (keys) deprecatedKeys.push(...keys)
    } while (dCursor !== 0)

    const deprecatedFormats: Record<string, number> = {}
    for (const key of deprecatedKeys) {
      const name = key.replace("tvt:deprecated_format:", "")
      const count = await r.get<number>(key)
      if (count) deprecatedFormats[name] = count
    }

    return jsonResponse({
      ok: true,
      recent_broadcasts: recentBroadcasts,
      validation_errors: validationErrors,
      format_stats: formatStats,
      theme_stats: themeStats,
      deprecated_formats: deprecatedFormats,
      total_broadcasts: broadcasts.length,
    }, 200, req)
  } catch (err) {
    console.error("[admin/insights]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
