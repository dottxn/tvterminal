import { Redis } from "@upstash/redis"

// ── Shared Redis client singleton ──
// All modules import from here instead of maintaining their own singletons.

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    if (!url || !token) throw new Error("Redis not configured (KV_REST_API_URL / KV_REST_API_TOKEN)")
    redis = new Redis({ url, token })
  }
  return redis
}

/**
 * Get Redis client that may return null (for non-critical paths like middleware).
 * Returns null instead of throwing if env vars are missing.
 */
export function getRedisSafe(): Redis | null {
  try {
    return getRedis()
  } catch {
    return null
  }
}
