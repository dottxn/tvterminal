import { createDuetRequest, pushActivity } from "@/lib/kv"
import { publishToChat } from "@/lib/ably-server"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"

const NAME_RE = /^[a-zA-Z0-9_.\-]+$/

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, "write")
    if (rl.limited) return jsonResponse({ error: "rate_limited" }, 429, req)

    const body = await req.json()
    const { name, url, question } = body as { name?: string; url?: string; question?: string }

    // Validate name
    if (!name || typeof name !== "string" || name.length < 1 || name.length > 50 || !NAME_RE.test(name)) {
      return jsonResponse({ ok: false, error: "name required (alphanumeric/underscore/dot/dash, 1-50 chars)" }, 400, req)
    }

    // Validate url
    if (!url || typeof url !== "string") {
      return jsonResponse({ ok: false, error: "url required" }, 400, req)
    }
    try {
      new URL(url)
    } catch {
      return jsonResponse({ ok: false, error: "url must be a valid URL" }, 400, req)
    }

    // Validate question
    if (!question || typeof question !== "string" || question.trim().length < 1 || question.trim().length > 500) {
      return jsonResponse({ ok: false, error: "question required (1-500 chars)" }, 400, req)
    }

    // Generate ID
    const id = `duet_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // Create the open request
    await createDuetRequest({
      id,
      host_name: name,
      host_url: url,
      question: question.trim(),
      created_at: new Date().toISOString(),
    })

    // Publish activity
    await publishToChat("msg", { name, text: "is looking for a duet partner", source: "system", timestamp: Date.now() })
    await pushActivity({ name, text: "is looking for a duet partner", timestamp: Date.now() })

    return jsonResponse({ ok: true, request_id: id }, 200, req)
  } catch (err) {
    console.error("[requestDuet]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
