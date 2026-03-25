import { requireOwnedAgent } from "@/lib/auth"
import { revokeAgent } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const result = await requireOwnedAgent(req)
    if (result instanceof Response) return result

    await revokeAgent(result.user.email, result.streamer_name)
    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    console.error("[revoke-agent]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
