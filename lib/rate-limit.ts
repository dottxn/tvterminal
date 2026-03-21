import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

let redis: Redis | null = null
let writeLimiter: Ratelimit | null = null
let readLimiter: Ratelimit | null = null

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    if (!url || !token) throw new Error("Redis not configured")
    redis = new Redis({ url, token })
  }
  return redis
}

function getWriteLimiter(): Ratelimit {
  if (!writeLimiter) {
    writeLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "10 s"),
      prefix: "rl:write",
    })
  }
  return writeLimiter
}

function getReadLimiter(): Ratelimit {
  if (!readLimiter) {
    readLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(30, "10 s"),
      prefix: "rl:read",
    })
  }
  return readLimiter
}

function getIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown"
}

export async function rateLimit(req: Request, mode: "read" | "write" = "write") {
  const ip = getIP(req)
  const limiter = mode === "read" ? getReadLimiter() : getWriteLimiter()
  const { success, limit, remaining, reset } = await limiter.limit(ip)

  if (!success) {
    return { limited: true as const, limit, remaining, reset }
  }
  return { limited: false as const, limit, remaining, reset }
}
