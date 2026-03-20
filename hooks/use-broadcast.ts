"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
    // Text themes + overrides
    theme?: "minimal" | "bold" | "neon" | "warm" | "matrix"
    bg_color?: string
    text_color?: string
    accent_color?: string
  }
}

export interface BatchSlide {
  type: "terminal" | "text" | "data" | "widget"
  content: Record<string, unknown>
  duration_seconds: number
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

export interface QueueEntry {
  position: number
  streamer_name: string
  scheduled_start: string
  duration_minutes: number
}

export interface LiveInfo {
  streamer_name: string
  seconds_remaining: number
  slot_end: string
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

// Helper to clear all duet-related state
function clearDuetDefaults() {
  return {
    duetState: null as { host: string; guest: string } | null,
    duetRequest: null as { streamer_name: string; expires_at: number } | null,
    hostFrame: null as BroadcastFrame | null,
    guestFrame: null as BroadcastFrame | null,
    hostTerminalBuffer: "",
    guestTerminalBuffer: "",
  }
}

export function useBroadcast() {
  const { client, connected } = useAbly()
  const [isLive, setIsLive] = useState(false)
  const [currentSlot, setCurrentSlot] = useState<SlotInfo | null>(null)
  const [latestFrame, setLatestFrame] = useState<BroadcastFrame | null>(null)
  const [terminalBuffer, setTerminalBuffer] = useState("")
  const [viewerCount, setViewerCount] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [liveInfo, setLiveInfo] = useState<LiveInfo | null>(null)

  // Batch playback state
  const [batchSlides, setBatchSlides] = useState<BatchSlide[]>([])
  const [batchIndex, setBatchIndex] = useState(0)
  const [isBatchPlaying, setIsBatchPlaying] = useState(false)
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Duet state
  const [duetState, setDuetState] = useState<{ host: string; guest: string } | null>(null)
  const [duetRequest, setDuetRequest] = useState<{ streamer_name: string; expires_at: number } | null>(null)
  const [hostFrame, setHostFrame] = useState<BroadcastFrame | null>(null)
  const [guestFrame, setGuestFrame] = useState<BroadcastFrame | null>(null)
  const [hostTerminalBuffer, setHostTerminalBuffer] = useState("")
  const [guestTerminalBuffer, setGuestTerminalBuffer] = useState("")

  // Poll /api/getQueue for real queue state
  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/getQueue")
      if (!res.ok) return
      const data = await res.json() as { live: LiveInfo | null; queue: QueueEntry[] }
      setLiveInfo(data.live)
      setQueue(data.queue)
    } catch {
      // Silently fail — queue polling is best-effort
    }
  }, [])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 10000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  // Re-fetch queue immediately on slot transitions
  useEffect(() => {
    fetchQueue()
  }, [isLive, fetchQueue])

  // Clear batch state helper
  const clearBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
      batchTimerRef.current = null
    }
    setBatchSlides([])
    setBatchIndex(0)
    setIsBatchPlaying(false)
  }, [])

  // Clear duet state helper
  const clearDuet = useCallback(() => {
    setDuetState(null)
    setDuetRequest(null)
    setHostFrame(null)
    setGuestFrame(null)
    setHostTerminalBuffer("")
    setGuestTerminalBuffer("")
  }, [])

  // Auto-dismiss duet request after expiry
  useEffect(() => {
    if (!duetRequest) return
    const remaining = duetRequest.expires_at - Date.now()
    if (remaining <= 0) {
      setDuetRequest(null)
      return
    }
    const timer = setTimeout(() => setDuetRequest(null), remaining)
    return () => clearTimeout(timer)
  }, [duetRequest])

  // Batch auto-advance
  useEffect(() => {
    if (!isBatchPlaying || batchSlides.length === 0) return

    const currentSlide = batchSlides[batchIndex]
    if (!currentSlide) {
      clearBatch()
      fetchQueue()
      return
    }

    setLatestFrame({
      type: currentSlide.type,
      content: currentSlide.content as BroadcastFrame["content"],
    })

    if (currentSlide.type !== "terminal") {
      setTerminalBuffer("")
    }

    batchTimerRef.current = setTimeout(() => {
      setBatchIndex((prev) => prev + 1)
    }, currentSlide.duration_seconds * 1000)

    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current)
        batchTimerRef.current = null
      }
    }
  }, [isBatchPlaying, batchSlides, batchIndex, clearBatch, fetchQueue])

  // Ably subscriptions
  useEffect(() => {
    if (!client) return

    const liveChannel = client.channels.get("tvt:live")
    const chatChannel = client.channels.get("tvt:chat")

    // Frame handler — routes to duet halves if role is present
    liveChannel.subscribe("frame", (msg) => {
      const frame = msg.data as BroadcastFrame & { role?: "host" | "guest" }

      if (frame.role === "host") {
        setHostFrame(frame)
        if (frame.type === "terminal" && frame.content.screen) {
          if (frame.delta) {
            setHostTerminalBuffer((prev) => prev + frame.content.screen)
          } else {
            setHostTerminalBuffer(frame.content.screen ?? "")
          }
        }
      } else if (frame.role === "guest") {
        setGuestFrame(frame)
        if (frame.type === "terminal" && frame.content.screen) {
          if (frame.delta) {
            setGuestTerminalBuffer((prev) => prev + frame.content.screen)
          } else {
            setGuestTerminalBuffer(frame.content.screen ?? "")
          }
        }
      } else {
        // Regular (non-duet) frame
        setLatestFrame(frame)
        if (frame.type === "terminal" && frame.content.screen) {
          if (frame.delta) {
            setTerminalBuffer((prev) => prev + frame.content.screen)
          } else {
            setTerminalBuffer(frame.content.screen ?? "")
          }
        }
      }
    })

    // Batch handler
    liveChannel.subscribe("batch", (msg) => {
      const data = msg.data as { slides: BatchSlide[]; total_duration_seconds: number; slide_count: number }
      if (data.slides && data.slides.length > 0) {
        setBatchSlides(data.slides)
        setBatchIndex(0)
        setIsBatchPlaying(true)
        setTerminalBuffer("")
      }
    })

    // Duet request (open invitation)
    liveChannel.subscribe("duet_request", (msg) => {
      const data = msg.data as { streamer_name: string; expires_in: number }
      setDuetRequest({
        streamer_name: data.streamer_name,
        expires_at: Date.now() + data.expires_in * 1000,
      })
    })

    // Duet accepted — split screen begins
    liveChannel.subscribe("duet_start", (msg) => {
      const data = msg.data as { host: string; guest: string }
      setDuetState({ host: data.host, guest: data.guest })
      setDuetRequest(null)
      setGuestFrame(null)
      setGuestTerminalBuffer("")
    })

    // Duet ends
    liveChannel.subscribe("duet_end", () => {
      setDuetState(null)
      setDuetRequest(null)
      setHostFrame(null)
      setGuestFrame(null)
      setHostTerminalBuffer("")
      setGuestTerminalBuffer("")
    })

    // Slot start
    liveChannel.subscribe("slot_start", (msg) => {
      const data = msg.data as SlotInfo
      setIsLive(true)
      setCurrentSlot(data)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
      clearDuet()
    })

    // Slot end
    liveChannel.subscribe("slot_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
      clearDuet()
    })

    // Widget start
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
      clearBatch()
      clearDuet()
    })

    // Widget end
    liveChannel.subscribe("widget_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
      clearDuet()
    })

    // Presence for viewer count
    const updateViewers = async () => {
      try {
        const members = await liveChannel.presence.get()
        setViewerCount(members.length)
      } catch {
        // Silently fail
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
  }, [client, clearBatch, clearDuet])

  return {
    connected,
    isLive,
    currentSlot,
    latestFrame,
    terminalBuffer,
    viewerCount,
    chatMessages,
    queue,
    liveInfo,
    // Batch state
    isBatchPlaying,
    batchSlides,
    batchIndex,
    // Duet state
    duetState,
    duetRequest,
    hostFrame,
    guestFrame,
    hostTerminalBuffer,
    guestTerminalBuffer,
  }
}
