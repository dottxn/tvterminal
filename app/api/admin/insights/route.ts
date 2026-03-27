import { getAuthUser } from "@/lib/auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { getValidationErrors } from "@/lib/kv"

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean),
)

// ── 30s server-side cache ──
let cachedResponse: { data: Record<string, unknown>; expires: number } | null = null
const CACHE_TTL_MS = 30_000

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user || !ADMIN_EMAILS.has(user.email)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, req)
    }

    // Return cached response if fresh
    if (cachedResponse && Date.now() < cachedResponse.expires) {
      return jsonResponse(cachedResponse.data, 200, req)
    }

    // Get validation errors
    const validationErrors = await getValidationErrors(50)

    const data = {
      ok: true,
      validation_errors: validationErrors,
    }

    // Cache the response
    cachedResponse = { data, expires: Date.now() + CACHE_TTL_MS }

    return jsonResponse(data, 200, req)
  } catch (err) {
    console.error("[admin/insights]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
