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
    // GIF background
    gif_url?: string
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

  // Duet state — structured 3-turn conversation
  const [duetState, setDuetState] = useState<{
    host: string
    guest: string
    question: string
    answer: string
  } | null>(null)
  const [duetReply, setDuetReply] = useState<string | null>(null)
  const [duetTurn, setDuetTurn] = useState(0) // 0=none, 1=question, 2=answer, 3=reply
  const [duetRequest, setDuetRequest] = useState<{
    streamer_name: string
    question: string
    expires_at: number
  } | null>(null)
  const duetTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const slotEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Hydrate current broadcast state on mount (recover missed Ably events)
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    async function hydrate() {
      try {
        const res = await fetch("/api/currentBroadcast")
        if (!res.ok) return
        const data = await res.json() as Record<string, unknown>
        if (!data.live) return

        // Set slot as live
        setIsLive(true)
        setCurrentSlot({
          streamer_name: data.streamer_name as string,
          streamer_url: data.streamer_url as string,
          slot_end: data.slot_end as string,
        })

        // Hydrate batch if active
        if (data.batch) {
          const batch = data.batch as { slides: BatchSlide[]; started_at: number; ends_at: string }
          const now = Date.now()
          const elapsed = (now - batch.started_at) / 1000

          // Calculate which slide we should be on
          let cumulativeDuration = 0
          let currentIdx = 0
          for (let i = 0; i < batch.slides.length; i++) {
            cumulativeDuration += batch.slides[i].duration_seconds
            if (elapsed < cumulativeDuration) {
              currentIdx = i
              break
            }
            if (i === batch.slides.length - 1) {
              currentIdx = i // Last slide
            }
          }

          setBatchSlides(batch.slides)
          setBatchIndex(currentIdx)
          setIsBatchPlaying(true)
        }

        // Hydrate duet if active
        if (data.duet) {
          const duet = data.duet as { host_name: string; guest_name: string; question: string; answer: string; reply?: string }
          setDuetState({
            host: duet.host_name,
            guest: duet.guest_name,
            question: duet.question,
            answer: duet.answer,
          })
          if (duet.reply) {
            setDuetReply(duet.reply)
          }
        }
      } catch {
        // Best-effort hydration
      }
    }

    hydrate()
  }, [])

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
    duetTimersRef.current.forEach(clearTimeout)
    duetTimersRef.current = []
    setDuetState(null)
    setDuetRequest(null)
    setDuetReply(null)
    setDuetTurn(0)
  }, [])

  // Push an activity log entry (appears in the sidebar activity feed)
  const pushActivity = useCallback((name: string, text: string) => {
    setChatMessages((prev) => [
      ...prev.slice(-30),
      { name, text, color: nameToColor(name), timestamp: Date.now() },
    ])
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

  // Duet auto-advance: Turn 1 (8s) → Turn 2 (8s) → wait for reply → Turn 3 (8s)
  useEffect(() => {
    if (!duetState) return

    // Clear any old timers
    duetTimersRef.current.forEach(clearTimeout)
    duetTimersRef.current = []

    // Start at Turn 1
    setDuetTurn(1)

    // Advance to Turn 2 after 8s
    const t1 = setTimeout(() => setDuetTurn(2), 8000)
    duetTimersRef.current.push(t1)

    return () => {
      duetTimersRef.current.forEach(clearTimeout)
      duetTimersRef.current = []
    }
  }, [duetState])

  // When reply arrives, show Turn 3 (but only after Turn 2 has had time)
  useEffect(() => {
    if (!duetReply || !duetState) return

    if (duetTurn >= 2) {
      // Already showing answer, advance to reply after a brief pause
      const t = setTimeout(() => setDuetTurn(3), 1500)
      duetTimersRef.current.push(t)
      return () => clearTimeout(t)
    }
    // If reply arrives early, it'll naturally show when turn catches up
  }, [duetReply, duetState, duetTurn])

  // Batch auto-advance
  useEffect(() => {
    if (!isBatchPlaying || batchSlides.length === 0) return

    const currentSlide = batchSlides[batchIndex]
    if (!currentSlide) {
      // All slides played — clear everything immediately.
      // Progress bar is the source of truth; content should not linger.
      clearBatch()
      setLatestFrame(null)
      setTerminalBuffer("")
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

    // Frame handler (regular frames only — duets are conversation-based now)
    liveChannel.subscribe("frame", (msg) => {
      const frame = msg.data as BroadcastFrame
      setLatestFrame(frame)
      if (frame.type === "terminal" && frame.content.screen) {
        if (frame.delta) {
          setTerminalBuffer((prev) => prev + frame.content.screen)
        } else {
          setTerminalBuffer(frame.content.screen ?? "")
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

    // Duet request (open invitation with question)
    liveChannel.subscribe("duet_request", (msg) => {
      const data = msg.data as { streamer_name: string; expires_in: number; question?: string }
      setDuetRequest({
        streamer_name: data.streamer_name,
        question: data.question || "",
        expires_at: Date.now() + data.expires_in * 1000,
      })
      pushActivity(data.streamer_name, "is looking for a duet partner")
    })

    // Duet accepted — structured conversation begins
    liveChannel.subscribe("duet_start", (msg) => {
      const data = msg.data as { host: string; guest: string; question: string; answer: string }
      setDuetState({
        host: data.host,
        guest: data.guest,
        question: data.question || "",
        answer: data.answer || "",
      })
      setDuetRequest(null)
      setDuetReply(null)
      pushActivity(data.guest, "joined " + data.host + "'s duet")
    })

    // Host's reply arrives
    liveChannel.subscribe("duet_reply", (msg) => {
      const data = msg.data as { host: string; reply: string }
      setDuetReply(data.reply)
      pushActivity(data.host, "replied in the duet")
    })

    // Duet ends
    liveChannel.subscribe("duet_end", () => {
      setDuetState(null)
      setDuetRequest(null)
      setDuetReply(null)
      setDuetTurn(0)
    })

    // Slot start — keep the last frame visible until new content arrives
    // to avoid a flash of "WAITING FOR BROADCAST" between slots
    liveChannel.subscribe("slot_start", (msg) => {
      const data = msg.data as SlotInfo
      // Cancel pending slot_end cleanup — we have a new slot
      if (slotEndTimerRef.current) {
        clearTimeout(slotEndTimerRef.current)
        slotEndTimerRef.current = null
      }
      setIsLive(true)
      setCurrentSlot(data)
      setTerminalBuffer("")
      clearBatch()
      clearDuet()
      pushActivity(data.streamer_name, "went live")
    })

    // Slot end — only clear visual state if no next slot is imminent
    // The next slot_start will handle the transition smoothly
    liveChannel.subscribe("slot_end", (msg) => {
      const data = msg.data as { streamer_name?: string }
      if (data.streamer_name) {
        pushActivity(data.streamer_name, "finished broadcasting")
      }
      clearBatch()
      clearDuet()
      // Delay clearing the visual state to allow the next slot_start to arrive
      // If no slot_start comes within 500ms, show idle state
      const endTimer = setTimeout(() => {
        setIsLive(false)
        setCurrentSlot(null)
        setLatestFrame(null)
        setTerminalBuffer("")
      }, 500)
      // Store timer so slot_start can cancel it
      slotEndTimerRef.current = endTimer
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
        ...prev.slice(-30),
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
  }, [client, clearBatch, clearDuet, pushActivity])

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
    duetReply,
    duetTurn,
  }
}
