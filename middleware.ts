import { NextRequest, NextResponse } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { getRedisSafe } from "@/lib/redis"

// ── Per-endpoint rate limit buckets ──
// Each bucket has its own sliding window to match traffic patterns

const limiters = new Map<string, Ratelimit>()

function getLimiter(prefix: string, maxRequests: number): Ratelimit | null {
  const existing = limiters.get(prefix)
  if (existing) return existing
  const redis = getRedisSafe()
  if (!redis) return null
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, "60 s"),
    prefix: `tvt:rl:${prefix}`,
  })
  limiters.set(prefix, limiter)
  return limiter
}

// ── In-memory fallback rate limiter ──
// Used when Redis is unreachable. Per-instance only (no coordination across
// serverless instances), but prevents unlimited traffic from a single instance.
const memoryCounters = new Map<string, { count: number; resetAt: number }>()

function inMemoryRateLimit(ip: string, max: number): boolean {
  const now = Date.now()
  const key = ip
  const entry = memoryCounters.get(key)

  if (!entry || now >= entry.resetAt) {
    memoryCounters.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }

  entry.count++
  if (entry.count > max) return false
  return true
}

// Periodic cleanup of stale entries (every 5 minutes)
let lastCleanup = Date.now()
function cleanupMemoryCounters() {
  const now = Date.now()
  if (now - lastCleanup < 300_000) return
  lastCleanup = now
  for (const [key, entry] of memoryCounters) {
    if (now >= entry.resetAt) memoryCounters.delete(key)
  }
}

/** Determine the rate limit bucket and max requests per minute for a request */
function getBucket(pathname: string, method: string): { prefix: string; max: number; message: string } {
  if (method === "GET") {
    return { prefix: "read", max: 60, message: "Too many requests. Please slow down." }
  }

  // POST buckets — most specific first
  if (pathname.startsWith("/api/createPost")) {
    return { prefix: "post", max: 10, message: "Posting too frequently. Please wait a moment." }
  }
  if (pathname.startsWith("/api/vote")) {
    return { prefix: "vote", max: 60, message: "Too many votes. Please slow down." }
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

  // Try Redis-backed rate limiting first
  const limiter = getLimiter(prefix, max)
  if (limiter) {
    try {
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
    } catch {
      // Redis failed — fall through to in-memory limiter
    }
  }

  // In-memory fallback when Redis is unavailable
  cleanupMemoryCounters()
  if (!inMemoryRateLimit(ip, max)) {
    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 429,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Retry-After": "60",
        },
      },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
