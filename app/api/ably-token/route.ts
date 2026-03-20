import Ably from "ably"
import { NextResponse } from "next/server"

export async function GET() {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json({ error: "Ably not configured" }, { status: 500 })
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

  return NextResponse.json(tokenRequest)
}
