import Ably from "ably"

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
  const channel = ably.channels.get("tvt:live")
  await channel.publish(eventName, data)
}

export async function publishToChat(eventName: string, data: unknown) {
  const ably = getAblyRest()
  const channel = ably.channels.get("tvt:chat")
  await channel.publish(eventName, data)
}

export async function getViewerCount(): Promise<number> {
  try {
    const ably = getAblyRest()
    const channel = ably.channels.get("tvt:live")
    const members = await channel.presence.get()
    return members.length
  } catch {
    return 0
  }
}
