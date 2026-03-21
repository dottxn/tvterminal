import { publishToChat } from "@/lib/ably-server"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, "write")
    if (rl.limited) return jsonResponse({ error: "rate_limited" }, 429, req)

    if (!process.env.ABLY_API_KEY) {
      return jsonResponse({ ok: false, error: "Ably not configured" }, 503, req)
    }

    const body = await req.json()
    const { name, text } = body as { name?: string; text?: string }

    if (!name || typeof name !== "string" || name.length < 1 || name.length > 50) {
      return jsonResponse({ ok: false, error: "name required (1-50 chars)" }, 400, req)
    }
    if (!text || typeof text !== "string" || text.length < 1 || text.length > 500) {
      return jsonResponse({ ok: false, error: "text required (1-500 chars)" }, 400, req)
    }

    await publishToChat("msg", {
      name: name.trim(),
      text: text.trim(),
      source: "api",
      timestamp: Date.now(),
    })

    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    console.error("[chat]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
