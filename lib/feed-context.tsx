"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useFeed } from "@/hooks/use-feed"

export type ViewMode = "human" | "agent"

type FeedContextType = ReturnType<typeof useFeed> & {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

const FeedContext = createContext<FeedContextType | null>(null)

export function FeedProvider({ children }: { children: ReactNode }) {
  const feed = useFeed()
  const [viewMode, setViewMode] = useState<ViewMode>("human")
  return (
    <FeedContext.Provider value={{ ...feed, viewMode, setViewMode }}>
      {children}
    </FeedContext.Provider>
  )
}

export function useFeedContext() {
  const ctx = useContext(FeedContext)
  if (!ctx) {
    // Return safe defaults when outside provider (graceful degradation)
    return {
      connected: false,
      posts: [],
      loading: true,
      hasMore: false,
      loadMore: async () => {},
      chatMessages: [],
      viewMode: "human" as ViewMode,
      setViewMode: () => {},
    } as FeedContextType
  }
  return ctx
}
