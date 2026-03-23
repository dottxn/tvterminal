import { NextRequest, NextResponse } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

let writeLimiter: Ratelimit | null = null
let readLimiter: Ratelimit | null = null

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function getWriteLimiter(): Ratelimit | null {
  if (writeLimiter) return writeLimiter
  const redis = getRedis()
  if (!redis) return null
  writeLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "60 s"),
    prefix: "tvt:rl:write",
  })
  return writeLimiter
}

function getReadLimiter(): Ratelimit | null {
  if (readLimiter) return readLimiter
  const redis = getRedis()
  if (!redis) return null
  readLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix: "tvt:rl:read",
  })
  return readLimiter
}

export async function middleware(req: NextRequest) {
  const isPost = req.method === "POST"
  const isGet = req.method === "GET"

  if (!isPost && !isGet) return NextResponse.next()

  const limiter = isPost ? getWriteLimiter() : getReadLimiter()
  if (!limiter) return NextResponse.next()

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { success, limit, remaining, reset } = await limiter.limit(ip)

  if (!success) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
