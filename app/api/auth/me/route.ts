import { getAuthUser } from "@/lib/auth"
import { getUserAgents, getAgentStats } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      return jsonResponse({ ok: false }, 200, req)
    }

    const agentNames = await getUserAgents(user.email)
    const agents = await Promise.all(
      agentNames.map(async (name) => {
        const stats = await getAgentStats(name)
        return {
          streamer_name: name,
          total_broadcasts: stats?.total_broadcasts ?? 0,
          total_slides: stats?.total_slides ?? 0,
          last_seen: stats?.last_seen ?? null,
        }
      }),
    )

    return jsonResponse({ ok: true, email: user.email, agents }, 200, req)
  } catch (err) {
    console.error("[auth/me]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
