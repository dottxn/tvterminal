"use client"

import { useEffect, useState } from "react"
import { useAbly } from "@/lib/ably-client"

export interface BroadcastFrame {
  type: "terminal" | "text" | "data" | "widget"
  delta?: boolean
  content: {
    screen?: string
    text?: string
    headline?: string
    body?: string
    meta?: string
    rows?: Array<{ label: string; value: string; change?: string }>
    widget_url?: string
    widget_type?: string
  }
}

export interface SlotInfo {
  streamer_name: string
  streamer_url?: string
  slot_end?: string
  type?: string
}

export interface ChatMessage {
  name: string
  text: string
  color?: string
  timestamp: number
}

// Generate a consistent color from a string
function nameToColor(name: string): string {
  const colors = ["#E63946", "#00c853", "#ff7b00", "#00b8d9", "#9b59b6", "#e67e22", "#1abc9c"]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function useBroadcast() {
  const { client, connected } = useAbly()
  const [isLive, setIsLive] = useState(false)
  const [currentSlot, setCurrentSlot] = useState<SlotInfo | null>(null)
  const [latestFrame, setLatestFrame] = useState<BroadcastFrame | null>(null)
  const [terminalBuffer, setTerminalBuffer] = useState("")
  const [viewerCount, setViewerCount] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!client) return

    const liveChannel = client.channels.get("tvt:live")
    const chatChannel = client.channels.get("tvt:chat")

    // Frame handler
    liveChannel.subscribe("frame", (msg) => {
      const frame = msg.data as BroadcastFrame
      setLatestFrame(frame)

      // Accumulate terminal content
      if (frame.type === "terminal" && frame.content.screen) {
        if (frame.delta) {
          setTerminalBuffer((prev) => prev + frame.content.screen)
        } else {
          setTerminalBuffer(frame.content.screen ?? "")
        }
      }
    })

    // Slot start (old system)
    liveChannel.subscribe("slot_start", (msg) => {
      const data = msg.data as SlotInfo
      setIsLive(true)
      setCurrentSlot(data)
      setLatestFrame(null)
      setTerminalBuffer("")
    })

    // Slot end (old system)
    liveChannel.subscribe("slot_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
    })

    // Widget start (newer system)
    liveChannel.subscribe("widget_start", (msg) => {
      const data = msg.data
      setIsLive(true)
      setCurrentSlot({
        streamer_name: data.agent_name || data.streamer_name || "unknown",
        type: data.widget_type || data.type,
        slot_end: data.slot_end,
      })
      setLatestFrame(null)
      setTerminalBuffer("")
    })

    // Widget end (newer system)
    liveChannel.subscribe("widget_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
    })

    // Presence for viewer count
    const updateViewers = async () => {
      try {
        const members = await liveChannel.presence.get()
        setViewerCount(members.length)
      } catch {
        // Silently fail — presence may not be available
      }
    }

    liveChannel.presence.subscribe(updateViewers)
    liveChannel.presence.enter({ role: "viewer" }).catch(() => {})
    updateViewers()

    // Chat messages
    chatChannel.subscribe("msg", (msg) => {
      const data = msg.data as { name: string; text: string; source?: string }
      setChatMessages((prev) => [
        ...prev.slice(-20),
        {
          name: data.name,
          text: data.text,
          color: nameToColor(data.name),
          timestamp: Date.now(),
        },
      ])
    })

    return () => {
      liveChannel.unsubscribe()
      chatChannel.unsubscribe()
      liveChannel.presence.leave().catch(() => {})
    }
  }, [client])

  return {
    connected,
    isLive,
    currentSlot,
    latestFrame,
    terminalBuffer,
    viewerCount,
    chatMessages,
  }
}
