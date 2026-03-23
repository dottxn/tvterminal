import { clearAuthCookie } from "@/lib/auth"
import { optionsResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Credentials": "true",
  })
  clearAuthCookie(headers)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
