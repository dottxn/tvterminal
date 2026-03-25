"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAbly } from "@/lib/ably-client"
import { CHANNEL_LIVE, CHANNEL_CHAT } from "@/lib/types"

export interface BroadcastFrame {
  type: "terminal" | "text" | "data" | "widget" | "duet" | "image" | "poll" | "build"
  delta?: boolean
  content: {
    screen?: string
    text?: string
    headline?: string
    body?: string
    meta?: string
    rows?: Array<{ label: string; value: string; change?: string }>
    // Data table style
    data_style?: "default" | "ticker" | "chalk" | "ledger"
    widget_url?: string
    widget_type?: string
    // Text themes + overrides (unknown themes fall through to default)
    theme?: string
    bg_color?: string
    text_color?: string
    accent_color?: string
    // GIF background
    gif_url?: string
    // Duet fields
    turn?: number
    speaker_name?: string
    speaker_role?: "host" | "guest"
    question?: string
    answer?: string
    reply?: string
    host_name?: string
    guest_name?: string
    // Image fields
    image_url?: string
    caption?: string
    // Poll fields
    options?: string[]
    poll_id?: string
    // Build format fields
    steps?: Array<{ type: "log" | "milestone" | "preview"; content: string }>
  }
}

export interface BatchSlide {
  type: "terminal" | "text" | "data" | "widget" | "duet" | "image" | "poll" | "build"
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

export interface ActivePoll {
  poll_id: string
  question: string
  options: string[]
  results: number[]
  voted: boolean
  votedIndex: number | null
}

export interface Notification {
  id: string
  name: string
  text: string
  exiting?: boolean
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
  const [isDuetTyping, setIsDuetTyping] = useState(false)
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll state
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null)

  // Stacking notification toasts (max 3, bottom-right)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const notifIdRef = useRef(0)

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

        // Hydrate persistent activity log
        if (Array.isArray(data.activity) && data.activity.length > 0) {
          const entries = (data.activity as Array<{ name: string; text: string; timestamp: number }>).reverse()
          setChatMessages(entries.map((e) => ({
            name: e.name,
            text: e.text,
            color: nameToColor(e.name),
            timestamp: e.timestamp,
          })))
        }

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
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    setBatchSlides([])
    setBatchIndex(0)
    setIsBatchPlaying(false)
    setIsDuetTyping(false)
  }, [])

  // Push an activity log entry (appears in the sidebar activity feed)
  const pushActivity = useCallback((name: string, text: string) => {
    setChatMessages((prev) => [
      ...prev.slice(-30),
      { name, text, color: nameToColor(name), timestamp: Date.now() },
    ])
  }, [])

  // Push a stacking notification toast (max 3, auto-dismiss after 5s)
  const pushNotification = useCallback((name: string, text: string) => {
    const id = `notif-${++notifIdRef.current}`
    setNotifications((prev) => {
      // Mark oldest for exit if we're at max
      const next = prev.length >= 3
        ? [...prev.slice(1), { id, name, text }]
        : [...prev, { id, name, text }]
      return next
    })
    // Start exit animation then remove after 5s
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, exiting: true } : n))
      )
      // Remove after exit animation completes
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
      }, 250)
    }, 5000)
  }, [])

  // Vote on active poll
  const vote = useCallback(async (pollId: string, optionIndex: number) => {
    if (!client) return
    const viewerId = client.auth.clientId
    if (!viewerId) return
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poll_id: pollId, option_index: optionIndex, viewer_id: viewerId }),
      })
      if (!res.ok) return
      const data = await res.json() as { results?: number[] }
      if (data.results) {
        setActivePoll((prev) => prev ? { ...prev, results: data.results!, voted: true, votedIndex: optionIndex } : prev)
      }
    } catch {
      // Best-effort vote
    }
  }, [client])

  // Initialize activePoll when a poll frame is displayed (via latestFrame or batch)
  const currentBatchSlide = isBatchPlaying ? batchSlides[batchIndex] : null
  const pollSource = currentBatchSlide?.type === "poll"
    ? currentBatchSlide.content as Record<string, unknown>
    : latestFrame?.type === "poll"
      ? latestFrame.content
      : null

  useEffect(() => {
    if (!pollSource) {
      setActivePoll(null)
      return
    }
    const pollId = pollSource.poll_id as string | undefined
    const question = pollSource.question as string | undefined
    const options = pollSource.options as string[] | undefined
    if (pollId && question && options) {
      setActivePoll((prev) => {
        // Don't reset if already tracking this poll (preserves vote state)
        if (prev?.poll_id === pollId) return prev
        return {
          poll_id: pollId,
          question,
          options,
          results: new Array(options.length).fill(0),
          voted: false,
          votedIndex: null,
        }
      })
    }
  }, [pollSource])

  // Batch auto-advance (with duet typing indicators)
  useEffect(() => {
    if (!isBatchPlaying || batchSlides.length === 0) return

    const currentSlide = batchSlides[batchIndex]
    if (!currentSlide) {
      // All slides played — clear everything immediately.
      clearBatch()
      setLatestFrame(null)
      setTerminalBuffer("")
      fetchQueue()
      return
    }

    setLatestFrame({
      type: currentSlide.type as BroadcastFrame["type"],
      content: currentSlide.content as BroadcastFrame["content"],
    })
    setIsDuetTyping(false)

    if (currentSlide.type !== "terminal") {
      setTerminalBuffer("")
    }

    // Check if the NEXT slide is also a duet (to show typing indicator)
    const nextSlide = batchSlides[batchIndex + 1]
    const isCurrentDuet = currentSlide.type === "duet"
    const isNextDuet = nextSlide?.type === "duet"
    const TYPING_LEAD_TIME = 2500 // Show typing indicator 2.5s before slide ends

    if (isCurrentDuet && isNextDuet) {
      // Show typing indicator partway through the slide (feels like the next speaker is composing)
      const showTypingAt = Math.max(1000, currentSlide.duration_seconds * 1000 - TYPING_LEAD_TIME)

      typingTimerRef.current = setTimeout(() => {
        setIsDuetTyping(true)
      }, showTypingAt)

      batchTimerRef.current = setTimeout(() => {
        setBatchIndex((prev) => prev + 1)
      }, currentSlide.duration_seconds * 1000)
    } else {
      // Normal advance (non-duet or last duet slide)
      batchTimerRef.current = setTimeout(() => {
        setBatchIndex((prev) => prev + 1)
      }, currentSlide.duration_seconds * 1000)
    }

    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current)
        batchTimerRef.current = null
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }
  }, [isBatchPlaying, batchSlides, batchIndex, clearBatch, fetchQueue])

  // Ably subscriptions
  useEffect(() => {
    if (!client) return

    const liveChannel = client.channels.get(CHANNEL_LIVE)
    const chatChannel = client.channels.get(CHANNEL_CHAT)

    // Frame handler
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
        setIsDuetTyping(false)
        setTerminalBuffer("")

        // If this is a duet batch, push a duet-specific activity notification
        const firstSlide = data.slides[0]
        if (firstSlide?.type === "duet") {
          const c = firstSlide.content as Record<string, unknown>
          const hostName = c.host_name as string
          const guestName = c.guest_name as string
          if (hostName && guestName) {
            pushActivity(hostName, `duet with ${guestName} is live`)
            pushNotification(hostName, `duet with ${guestName}`)
          }
        }
      }
    })

    // Slot start — keep the last frame visible until new content arrives
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
      pushActivity(data.streamer_name, "went live")
      pushNotification(data.streamer_name, "went live")
    })

    // Slot end — only clear visual state if no next slot is imminent
    liveChannel.subscribe("slot_end", (msg) => {
      const data = msg.data as { streamer_name?: string }
      if (data.streamer_name) {
        pushActivity(data.streamer_name, "finished broadcasting")
      }
      clearBatch()
      setActivePoll(null)
      // Delay clearing the visual state to allow the next slot_start to arrive
      const endTimer = setTimeout(() => {
        setIsLive(false)
        setCurrentSlot(null)
        setLatestFrame(null)
        setTerminalBuffer("")
      }, 500)
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
    })

    // Widget end
    liveChannel.subscribe("widget_end", () => {
      setIsLive(false)
      setCurrentSlot(null)
      setLatestFrame(null)
      setTerminalBuffer("")
      clearBatch()
    })

    // Poll results update (real-time vote results)
    liveChannel.subscribe("poll_update", (msg) => {
      const data = msg.data as { poll_id: string; results: number[] }
      setActivePoll((prev) => {
        if (!prev || prev.poll_id !== data.poll_id) return prev
        return { ...prev, results: data.results }
      })
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

      // Show toast for system duet messages (skip "completed" — other notifs cover it)
      if (data.source === "system" && data.text.includes("duet") && !data.text.includes("completed")) {
        pushNotification(data.name, data.text)
      }
    })

    return () => {
      liveChannel.unsubscribe()
      chatChannel.unsubscribe()
      liveChannel.presence.leave().catch(() => {})
    }
  }, [client, clearBatch, pushActivity, pushNotification])

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
    isDuetTyping,
    // Poll state
    activePoll,
    vote,
    // Stacking notifications
    notifications,
  }
}
