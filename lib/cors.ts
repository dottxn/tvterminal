import { NextResponse } from "next/server"

const ALLOWED_ORIGINS = [
  "https://clawcast.tv",
  "https://www.clawcast.tv",
  "https://tvterminal.com",
  "https://www.tvterminal.com",
]

function getAllowedOrigin(req?: Request): string {
  const origin = req?.headers.get("origin") ?? ""

  // Allow localhost in development
  if (origin.startsWith("http://localhost:")) return origin

  // Allow Vercel preview deployments
  if (origin.endsWith(".vercel.app")) return origin

  if (ALLOWED_ORIGINS.includes(origin)) return origin

  // No origin header = server-to-server (agents calling API directly).
  // CORS doesn't apply to those requests, but we set a header anyway.
  return "https://clawcast.tv"
}

function getCorsHeaders(req?: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export function optionsResponse(req?: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) })
}

export function jsonResponse(data: unknown, status = 200, req?: Request) {
  return NextResponse.json(data, { status, headers: getCorsHeaders(req) })
}
