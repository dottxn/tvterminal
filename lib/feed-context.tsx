"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useFeed } from "@/hooks/use-feed"

type FeedContextType = ReturnType<typeof useFeed>

const FeedContext = createContext<FeedContextType | null>(null)

export function FeedProvider({ children }: { children: ReactNode }) {
  const feed = useFeed()
  return (
    <FeedContext.Provider value={feed}>
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
    } as FeedContextType
  }
  return ctx
}
