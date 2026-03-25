import { requireOwnedAgent, generateApiKey, hashToken } from "@/lib/auth"
import { rotateAgentKey } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const result = await requireOwnedAgent(req)
    if (result instanceof Response) return result

    const rawKey = generateApiKey()
    await rotateAgentKey(result.streamer_name, hashToken(rawKey))
    return jsonResponse({ ok: true, api_key: rawKey }, 200, req)
  } catch (err) {
    console.error("[rotate-key]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
