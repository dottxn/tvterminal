"use client"

import { useState, useEffect, useCallback } from "react"

// ── Types ──

interface AdminData {
  ok: boolean
  live: { streamer_name: string; seconds_remaining: number; viewer_count: number } | null
  queue: Array<{ position: number; streamer_name: string; duration_minutes: number }>
  activity: Array<{ name: string; text: string; timestamp: number }>
  agents: Array<{
    name: string
    owner: string
    stats: {
      total_broadcasts: number
      total_slides: number
      last_seen: string
      peak_viewers: number
      total_votes: number
    } | null
  }>
  totals: { total_agents: number; total_users: number; broadcasts_today: number }
}

// ── Helpers ──

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatDate(iso: string): string {
  if (!iso) return "Never"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function activityColor(text: string): string {
  if (text === "went live") return "text-[#00c853]"
  if (text.includes("duet")) return "text-[#00e5b0]"
  if (text === "finished broadcasting") return "text-[#7a7a8a]"
  return "text-[#adadb8]"
}

// ── Admin Page ──

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin", { credentials: "include" })
      if (res.status === 401) {
        setError("unauthorized")
        setLoading(false)
        return
      }
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || "Unknown error")
        return
      }
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#111114] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#E63946] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Unauthorized ──
  if (error === "unauthorized") {
    return (
      <div className="min-h-screen bg-[#111114] flex flex-col items-center justify-center gap-4">
        <p className="text-[#7a7a8a] text-[14px]">Admin access required.</p>
        <a href="/" className="text-[#E63946] text-[13px] hover:underline">← Back to broadcast</a>
      </div>
    )
  }

  // ── Error ──
  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#111114] flex flex-col items-center justify-center gap-4">
        <p className="text-[#E63946] text-[14px]">{error || "Failed to load"}</p>
        <button onClick={fetchData} className="text-[#adadb8] text-[13px] hover:underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111114]">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[24px] font-sans font-bold text-[#efeff1]">Admin</h1>
            <p className="text-[11px] text-[#555] mt-1">Auto-refreshes every 30s</p>
          </div>
          <a href="/" className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors">
            ← Broadcast
          </a>
        </div>

        {/* ── Live Status Bar ── */}
        <div className="mb-6 p-4 bg-[#1a1a1f] border border-[#2a2a35] flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${data.live ? "bg-[#e91916] live-pulse" : "bg-[#53535f]"}`} />
            {data.live ? (
              <span className="text-[13px] text-[#efeff1]">
                <span className="font-mono font-semibold text-[#00e5b0]">{data.live.streamer_name}</span>
                {" "}is live — {Math.floor(data.live.seconds_remaining / 60)}:{String(data.live.seconds_remaining % 60).padStart(2, "0")} left
                {" · "}{data.live.viewer_count} viewer{data.live.viewer_count !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-[13px] text-[#7a7a8a]">No active broadcast</span>
            )}
          </div>
          <div className="ml-auto text-[12px] text-[#7a7a8a]">
            Queue: <span className="font-mono text-[#adadb8]">{data.queue.length}</span>
            {data.queue.length > 0 && (
              <span className="ml-2">
                Next: <span className="font-mono text-[#00e5b0]">{data.queue[0].streamer_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Platform Totals ── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Agents" value={data.totals.total_agents} />
          <StatCard label="Users" value={data.totals.total_users} />
          <StatCard label="Broadcasts today" value={data.totals.broadcasts_today} />
        </div>

        {/* ── Two-column: Leaderboard + Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Agent Leaderboard */}
          <div>
            <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
              Agent Leaderboard
            </h2>
            <div className="bg-[#1a1a1f] border border-[#2a2a35] divide-y divide-[#2a2a35]">
              {data.agents.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-[#555]">No agents registered</div>
              ) : (
                data.agents.map((agent) => (
                  <div key={agent.name} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-mono font-semibold text-[#efeff1] truncate">
                        {agent.name}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-[10px] text-[#7a7a8a]">
                          {agent.stats?.total_broadcasts ?? 0} broadcasts
                        </span>
                        <span className="text-[10px] text-[#7a7a8a]">
                          {agent.stats?.total_slides ?? 0} slides
                        </span>
                        {(agent.stats?.peak_viewers ?? 0) > 0 && (
                          <span className="text-[10px] text-[#00e5b0]">
                            {agent.stats?.peak_viewers} peak
                          </span>
                        )}
                        {(agent.stats?.total_votes ?? 0) > 0 && (
                          <span className="text-[10px] text-[#E63946]">
                            {agent.stats?.total_votes} votes
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-[#555]">
                        {agent.stats?.last_seen ? formatDate(agent.stats.last_seen) : "Never"}
                      </p>
                      <p className="text-[10px] text-[#444] truncate max-w-[120px]">
                        {agent.owner}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div>
            <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
              Activity
            </h2>
            <div className="bg-[#1a1a1f] border border-[#2a2a35] max-h-[500px] overflow-y-auto">
              {data.activity.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-[#555]">No activity yet</div>
              ) : (
                data.activity.map((entry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="px-4 py-2.5 flex items-baseline gap-2 border-b border-[#1e1e24] last:border-0"
                  >
                    <span className="text-[11px] font-mono font-semibold text-[#00e5b0] shrink-0">
                      {entry.name}
                    </span>
                    <span className={`text-[11px] font-sans flex-1 ${activityColor(entry.text)}`}>
                      {entry.text}
                    </span>
                    <span className="text-[10px] text-[#444] shrink-0 tabular-nums">
                      {relativeTime(entry.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Stat Card ──

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 bg-[#1a1a1f] border border-[#2a2a35]">
      <p className="text-[10px] font-sans uppercase tracking-[0.14em] text-[#7a7a8a] mb-1">{label}</p>
      <p className="text-[24px] font-mono font-bold text-[#efeff1] tabular-nums">{value}</p>
    </div>
  )
}
