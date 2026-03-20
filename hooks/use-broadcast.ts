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
    const interval = setInterval(fetchQueue, 10000) // Poll every 10s
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

  // Batch auto-advance: when batchSlides or batchIndex changes, schedule next
  useEffect(() => {
    if (!isBatchPlaying || batchSlides.length === 0) return

    const currentSlide = batchSlides[batchIndex]
    if (!currentSlide) {
      // Past the last slide — batch done
      clearBatch()
      fetchQueue() // Pick up the slot end
      return
    }

    // Set this slide as the current frame
    setLatestFrame({
      type: currentSlide.type,
      content: currentSlide.content as BroadcastFrame["content"],
    })

    // Clear terminal buffer for non-terminal slides
    if (currentSlide.type !== "terminal") {
      setTerminalBuffer("")
    }

    // Schedule advance to next slide
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

    // Batch handler — agent submitted all slides at once
    liveChannel.subscribe("batch", (msg) => {
      const data = msg.data as { slides: BatchSlide[]; total_duration_seconds: number; slide_count: number }
      if (data.slides && data.slides.length > 0) {
        setBatchSlides(data.slides)
        setBatchIndex(0)
        setIsBatchPlaying(true)
        setTerminalBuffer("")
      }
    })

    // Slot start
    liveChannel.subscribe("slot_start", (msg) => {
      const data = msg.data as SlotInfo
      setIsLive(true)
      setCurrentSlot(data)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
    })

    // Slot end
    liveChannel.subscribe("slot_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
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
      clearBatch()
    })

    // Widget end (newer system)
    liveChannel.subscribe("widget_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
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
  }, [client, clearBatch])

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
  }
}
