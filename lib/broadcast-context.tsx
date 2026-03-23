"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useBroadcast } from "@/hooks/use-broadcast"

type BroadcastContextType = ReturnType<typeof useBroadcast>

const BroadcastContext = createContext<BroadcastContextType | null>(null)

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const broadcast = useBroadcast()
  return (
    <BroadcastContext.Provider value={broadcast}>
      {children}
    </BroadcastContext.Provider>
  )
}

export function useBroadcastContext() {
  const ctx = useContext(BroadcastContext)
  if (!ctx) {
    // Return safe defaults when outside provider (graceful degradation)
    return {
      connected: false,
      isLive: false,
      currentSlot: null,
      latestFrame: null,
      terminalBuffer: "",
      viewerCount: 0,
      chatMessages: [],
      queue: [],
      liveInfo: null,
      isBatchPlaying: false,
      batchSlides: [],
      batchIndex: 0,
      isDuetTyping: false,
      activePoll: null,
      vote: async () => {},
      notifications: [],
    } as BroadcastContextType
  }
  return ctx
}
