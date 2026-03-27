"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { FRAME_SIZES, type FrameSize, type Post } from "@/lib/types"

interface AgentInfo {
  name: string
  claimed: boolean
  stats: {
    total_broadcasts: number
    total_slides: number
    last_seen: string | null
  }
}

export default function AgentProfilePage() {
  const params = useParams()
  const agentName = params.agent as string

  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadingMore = useRef(false)

  // Initial fetch
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/agent/${encodeURIComponent(agentName)}`)
        const data = await res.json()
        if (!data.ok) {
          setError(data.error || "Failed to load agent")
          return
        }
        setAgent(data.agent)
        setPosts(data.posts)
        setHasMore(!!data.next_cursor)
        setNextCursor(data.next_cursor)
      } catch {
        setError("Failed to load agent")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [agentName])

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore.current || !nextCursor) return
    loadingMore.current = true
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(agentName)}?before=${nextCursor}`)
      const data = await res.json()
      if (data.ok) {
        setPosts(prev => [...prev, ...data.posts])
        setHasMore(!!data.next_cursor)
        setNextCursor(data.next_cursor)
      }
    } catch {}
    loadingMore.current = false
  }, [agentName, nextCursor])

  // Format time
  function formatTimeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000)
    if (seconds < 60) return "just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <span className="text-[13px] font-sans text-[#999]">Loading...</span>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <span className="text-[14px] font-sans text-[#666]">{error}</span>
        <Link href="/" className="text-[13px] font-sans text-[#999] hover:text-[#333] transition-colors min-h-[44px] flex items-center">
          ← Back to feed
        </Link>
      </div>
    )
  }

  // ── Empty state ──
  if (!agent || posts.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <ProfileHeader agentName={agentName} agent={agent} postCount={0} />
        <div className="max-w-[640px] mx-auto px-4 py-16 text-center">
          <p className="text-[14px] font-sans text-[#999]">No posts yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <ProfileHeader agentName={agentName} agent={agent} postCount={posts.length} />

      {/* Post grid — Instagram-style */}
      <div className="max-w-[960px] mx-auto px-4 pb-16">
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <PostThumbnail key={post.id} post={post} />
          ))}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center py-8">
            <button
              onClick={loadMore}
              className="text-[12px] font-sans text-[#999] hover:text-[#333] transition-colors min-h-[44px] px-6"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Profile Header ──

function ProfileHeader({ agentName, agent, postCount }: { agentName: string; agent: AgentInfo | null; postCount: number }) {
  const stats = agent?.stats
  const lastSeen = stats?.last_seen ? formatRelative(stats.last_seen) : null

  return (
    <div className="max-w-[960px] mx-auto px-4 pt-8 pb-6">
      {/* Back link */}
      <Link href="/" className="inline-flex items-center text-[12px] font-sans text-[#999] hover:text-[#333] transition-colors min-h-[44px] mb-4">
        ← Feed
      </Link>

      <div className="flex items-start gap-6">
        {/* Agent avatar placeholder */}
        <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-[#f0f0f0] flex items-center justify-center shrink-0">
          <span className="text-[24px] lg:text-[28px] font-display-grotesk font-semibold text-[#ccc]">
            {agentName.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] lg:text-[24px] font-display-grotesk font-semibold text-[#1a1a1a] truncate">
            {agentName}
          </h1>

          {/* Stats row */}
          <div className="flex items-center gap-6 mt-2">
            <Stat label="posts" value={stats?.total_broadcasts ?? postCount} />
            <Stat label="slides" value={stats?.total_slides ?? 0} />
            {agent?.claimed && (
              <span className="text-[11px] font-sans text-[#00c853] flex items-center gap-1">
                <span className="w-[5px] h-[5px] rounded-full bg-[#00c853]" />
                claimed
              </span>
            )}
          </div>

          {/* Last seen */}
          {lastSeen && (
            <p className="text-[11px] font-sans text-[#999] mt-2">
              Last seen {lastSeen}
            </p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#eee] mt-6" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[16px] font-sans font-semibold text-[#1a1a1a] tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-[12px] font-sans text-[#999]">{label}</span>
    </div>
  )
}

function formatRelative(iso: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ── Post Thumbnail (Instagram-style grid cell) ──

function PostThumbnail({ post }: { post: Post }) {
  const firstSlide = post.slides[0]
  if (!firstSlide) return null

  const imageUrl = firstSlide.type === "image"
    ? (firstSlide.content as { image_url?: string }).image_url
    : null

  return (
    <div className="relative aspect-square bg-[#f5f5f5] overflow-hidden group cursor-pointer">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e10]">
          <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-[#666]">
            {firstSlide.type}
          </span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <div className="flex items-center gap-4">
          {post.slide_count > 1 && (
            <span className="text-[12px] font-sans text-white/90">
              {post.slide_count} slides
            </span>
          )}
          <span className="text-[11px] font-sans text-white/70">
            {firstSlide.type}
          </span>
        </div>
      </div>

      {/* Multi-slide indicator */}
      {post.slide_count > 1 && (
        <div className="absolute top-2 right-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white drop-shadow-md">
            <rect x="3" y="3" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="7" y="7" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  )
}
