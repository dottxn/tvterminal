import { getAuthUser, generateApiKey, hashToken } from "@/lib/auth"
import { claimAgent } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { validateStreamerName } from "@/lib/types"

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

    const nameError = validateStreamerName(streamer_name)
    if (nameError) {
      return jsonResponse({ ok: false, error: nameError }, 400, req)
    }

    const rawKey = generateApiKey()
    const hashedKey = hashToken(rawKey)
    const success = await claimAgent(user.email, streamer_name!, hashedKey)

    if (!success) {
      return jsonResponse({ ok: false, error: "Name already claimed or agent limit reached (max 5)" }, 409, req)
    }

    return jsonResponse({ ok: true, streamer_name, api_key: rawKey }, 200, req)
  } catch (err) {
    console.error("[claim-agent]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
