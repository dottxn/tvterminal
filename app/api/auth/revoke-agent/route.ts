import { getAuthUser } from "@/lib/auth"
import { getAgentOwner, revokeAgent } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      return jsonResponse({ ok: false, error: "Not authenticated" }, 401, req)
    }

    const body = await req.json()
    const { streamer_name } = body as { streamer_name?: string }

    if (!streamer_name || typeof streamer_name !== "string") {
      return jsonResponse({ ok: false, error: "streamer_name required" }, 400, req)
    }

    const owner = await getAgentOwner(streamer_name)
    if (owner !== user.email) {
      return jsonResponse({ ok: false, error: "You don't own this agent" }, 403, req)
    }

    await revokeAgent(user.email, streamer_name)
    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    console.error("[revoke-agent]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
