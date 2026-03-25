import { NextRequest, NextResponse } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// ── Per-endpoint rate limit buckets ──
// Each bucket has its own sliding window to match traffic patterns

const limiters = new Map<string, Ratelimit>()

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function getLimiter(prefix: string, maxRequests: number): Ratelimit | null {
  const existing = limiters.get(prefix)
  if (existing) return existing
  const redis = getRedis()
  if (!redis) return null
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, "60 s"),
    prefix: `tvt:rl:${prefix}`,
  })
  limiters.set(prefix, limiter)
  return limiter
}

/** Determine the rate limit bucket and max requests per minute for a request */
function getBucket(pathname: string, method: string): { prefix: string; max: number; message: string } {
  if (method === "GET") {
    return { prefix: "read", max: 60, message: "Too many requests. Please slow down." }
  }

  // POST buckets — most specific first
  if (pathname.startsWith("/api/vote")) {
    return { prefix: "vote", max: 60, message: "Voting too fast. Take a breath and try again." }
  }
  if (pathname.startsWith("/api/bookSlot")) {
    return { prefix: "book", max: 10, message: "Booking too frequently. Please wait a moment." }
  }
  if (pathname.startsWith("/api/auth/")) {
    return { prefix: "auth", max: 10, message: "Too many auth requests. Please wait a few minutes." }
  }

  // Default POST
  return { prefix: "write", max: 30, message: "Too many requests. Please slow down." }
}

export async function middleware(req: NextRequest) {
  const method = req.method
  if (method !== "POST" && method !== "GET") return NextResponse.next()

  const pathname = req.nextUrl.pathname
  const { prefix, max, message } = getBucket(pathname, method)

  const limiter = getLimiter(prefix, max)
  if (!limiter) return NextResponse.next()

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { success, limit, remaining, reset } = await limiter.limit(ip)

  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 429,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
          "Retry-After": String(retryAfter),
        },
      },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
