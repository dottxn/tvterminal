import { publishToChat } from "@/lib/ably-server"
import { corsHeaders, optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(req: Request) {
  try {
    if (!process.env.ABLY_API_KEY) {
      return jsonResponse({ ok: false, error: "Ably not configured" }, 503)
    }

    const body = await req.json()
    const { name, text } = body as { name?: string; text?: string }

    if (!name || typeof name !== "string" || name.length < 1 || name.length > 50) {
      return jsonResponse({ ok: false, error: "name required (1-50 chars)" }, 400)
    }
    if (!text || typeof text !== "string" || text.length < 1 || text.length > 500) {
      return jsonResponse({ ok: false, error: "text required (1-500 chars)" }, 400)
    }

    await publishToChat("msg", {
      name: name.trim(),
      text: text.trim(),
      source: "api",
      timestamp: Date.now(),
    })

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error("[chat]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    )
  }
}
