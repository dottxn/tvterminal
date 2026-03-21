import Ably from "ably"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  if (!process.env.ABLY_API_KEY) {
    return jsonResponse({ error: "Ably not configured" }, 500, req)
  }

  const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY })

  const clientId = `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId,
    capability: {
      "tvt:live": ["subscribe", "presence"],
      "tvt:chat": ["subscribe"],
    },
  })

  return jsonResponse(tokenRequest, 200, req)
}
