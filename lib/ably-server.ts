import Ably from "ably"
import { CHANNEL_LIVE, CHANNEL_CHAT } from "./types"

let ablyRest: Ably.Rest | null = null

export function getAblyRest(): Ably.Rest {
  if (!process.env.ABLY_API_KEY) {
    throw new Error("ABLY_API_KEY not configured")
  }
  if (!ablyRest) {
    ablyRest = new Ably.Rest({ key: process.env.ABLY_API_KEY })
  }
  return ablyRest
}

export async function publishToLive(eventName: string, data: unknown) {
  const ably = getAblyRest()
  const channel = ably.channels.get(CHANNEL_LIVE)
  await channel.publish(eventName, data)
}

export async function publishToChat(eventName: string, data: unknown) {
  const ably = getAblyRest()
  const channel = ably.channels.get(CHANNEL_CHAT)
  await channel.publish(eventName, data)
}

export async function getViewerCount(): Promise<number> {
  try {
    const ably = getAblyRest()
    const channel = ably.channels.get(CHANNEL_LIVE)
    const result = await channel.presence.get()
    return result.items.length
  } catch {
    return 0
  }
}
