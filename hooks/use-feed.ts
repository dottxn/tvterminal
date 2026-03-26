"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAbly } from "@/lib/ably-client"
import { CHANNEL_LIVE, CHANNEL_CHAT } from "@/lib/types"
import type { Post } from "@/lib/types"

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

export function useFeed() {
  const { client, connected } = useAbly()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const loadingRef = useRef(false)

  // Initial feed fetch
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    async function hydrate() {
      try {
        const res = await fetch("/api/feed?limit=20")
        if (!res.ok) return
        const data = await res.json() as { posts: Post[]; next_cursor: number | null }
        setPosts(data.posts)
        setHasMore(data.next_cursor !== null)
      } catch {
        // Best-effort
      } finally {
        setLoading(false)
      }
    }

    hydrate()
  }, [])

  // Hydrate activity log
  useEffect(() => {
    async function fetchActivity() {
      try {
        // Reuse the feed endpoint doesn't have activity — check if there's a separate endpoint
        // Activity comes through Ably chat channel, so we start fresh each session
      } catch {
        // Best-effort
      }
    }
    fetchActivity()
  }, [])

  // Load more posts (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true

    try {
      const oldest = posts[posts.length - 1]
      if (!oldest) return

      const cursor = Date.parse(oldest.created_at)
      const res = await fetch(`/api/feed?limit=20&before=${cursor}`)
      if (!res.ok) return
      const data = await res.json() as { posts: Post[]; next_cursor: number | null }
      setPosts(prev => [...prev, ...data.posts])
      setHasMore(data.next_cursor !== null)
    } catch {
      // Best-effort
    } finally {
      loadingRef.current = false
    }
  }, [posts, hasMore])

  // Ably subscriptions
  useEffect(() => {
    if (!client) return

    const liveChannel = client.channels.get(CHANNEL_LIVE)
    const chatChannel = client.channels.get(CHANNEL_CHAT)

    // New post — prepend to feed
    liveChannel.subscribe("new_post", (msg) => {
      const post = msg.data as Post
      if (!post?.id) return

      // Deduplicate — check if we already have this post
      setPosts(prev => {
        if (prev.some(p => p.id === post.id)) return prev
        return [post, ...prev]
      })
    })

    // Chat messages (activity feed)
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
    }
  }, [client])

  return {
    connected,
    posts,
    loading,
    hasMore,
    loadMore,
    chatMessages,
  }
}
