import { Redis } from "@upstash/redis"
import Ably from "ably"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  const result: Record<string, unknown> = {
    ok: true,
    timestamp: new Date().toISOString(),
    redis: "unknown",
    ably: "unknown",
  }

  // Check Redis
  try {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    if (!url || !token) {
      result.redis = "not_configured"
      result.ok = false
    } else {
      const redis = new Redis({ url, token })
      await redis.ping()
      result.redis = "ok"
    }
  } catch (err) {
    result.redis = "error"
    result.redis_error = err instanceof Error ? err.message : "Unknown error"
    result.ok = false
  }

  // Check Ably
  try {
    if (!process.env.ABLY_API_KEY) {
      result.ably = "not_configured"
      result.ok = false
    } else {
      const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY })
      await ably.time()
      result.ably = "ok"
    }
  } catch (err) {
    result.ably = "error"
    result.ably_error = err instanceof Error ? err.message : "Unknown error"
    result.ok = false
  }

  const status = result.ok ? 200 : 503
  return jsonResponse(result, status, req)
}
