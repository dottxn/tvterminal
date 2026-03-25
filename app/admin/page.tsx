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

interface SlideMetadata {
  type: string
  theme?: string
  duration: number
  char_count?: number
  row_count?: number
  option_count?: number
  step_count?: number
  image_domain?: string
}

interface BroadcastEntry {
  slot_id: string
  streamer_name: string
  slides: SlideMetadata[]
  format_usage: Record<string, number>
  theme_usage: Record<string, number>
  total_duration: number
  ended_at: string
}

interface ValidationError {
  timestamp: number
  endpoint: string
  agent_name: string
  error_type: string
  error_message: string
  attempted_value?: string
}

interface InsightsData {
  ok: boolean
  recent_broadcasts: BroadcastEntry[]
  validation_errors: ValidationError[]
  format_stats: Record<string, number>
  theme_stats: Record<string, number>
  deprecated_formats: Record<string, number>
  total_broadcasts: number
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
  const [activeTab, setActiveTab] = useState<"status" | "insights">("status")

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[24px] font-sans font-bold text-[#efeff1]">Admin</h1>
            <p className="text-[11px] text-[#555] mt-1">Auto-refreshes every 30s</p>
          </div>
          <a href="/" className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors">
            ← Broadcast
          </a>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="flex gap-1 mb-6 border-b border-[#2a2a35]">
          <button
            onClick={() => setActiveTab("status")}
            className={`px-4 py-2 text-[12px] font-sans font-semibold transition-colors -mb-px ${
              activeTab === "status"
                ? "text-[#efeff1] border-b-2 border-[#E63946]"
                : "text-[#7a7a8a] hover:text-[#adadb8]"
            }`}
          >
            Live Status
          </button>
          <button
            onClick={() => setActiveTab("insights")}
            className={`px-4 py-2 text-[12px] font-sans font-semibold transition-colors -mb-px ${
              activeTab === "insights"
                ? "text-[#efeff1] border-b-2 border-[#E63946]"
                : "text-[#7a7a8a] hover:text-[#adadb8]"
            }`}
          >
            Content Insights
          </button>
        </div>

        {/* ── Tab Content ── */}
        {activeTab === "insights" ? (
          <ContentInsightsTab />
        ) : (
        <>

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
        </>
        )}
      </div>
    </div>
  )
}

// ── Content Insights Tab ──

function ContentInsightsTab() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/insights", { credentials: "include" })
        const json = await res.json()
        if (!json.ok) {
          setError(json.error || "Unknown error")
          return
        }
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-[#E63946] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-16">
        <p className="text-[13px] text-[#E63946]">{error || "Failed to load insights"}</p>
      </div>
    )
  }

  const formatEntries = Object.entries(data.format_stats).sort(([, a], [, b]) => b - a)
  const themeEntries = Object.entries(data.theme_stats).sort(([, a], [, b]) => b - a)
  const deprecatedEntries = Object.entries(data.deprecated_formats).sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-6">

      {/* ── Format Usage ── */}
      <div>
        <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
          Format Usage
          <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-[#555]">
            across {data.total_broadcasts} broadcast{data.total_broadcasts !== 1 ? "s" : ""} (7-day window)
          </span>
        </h2>
        {formatEntries.length === 0 ? (
          <p className="text-[13px] text-[#555]">No broadcast data yet</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {formatEntries.map(([format, count]) => (
              <StatCard key={format} label={format} value={count} />
            ))}
          </div>
        )}
      </div>

      {/* ── Theme Usage ── */}
      {themeEntries.length > 0 && (
        <div>
          <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
            Theme Usage
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {themeEntries.map(([theme, count]) => (
              <StatCard key={theme} label={theme} value={count} />
            ))}
          </div>
        </div>
      )}

      {/* ── Deprecated Theme Counters ── */}
      {deprecatedEntries.length > 0 && (
        <div>
          <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
            Deprecated Themes
            <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-[#E63946]">
              still being used
            </span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {deprecatedEntries.map(([name, count]) => (
              <div key={name} className="p-4 bg-[#1a1a1f] border border-[#3a2020]">
                <p className="text-[10px] font-sans uppercase tracking-[0.14em] text-[#E63946] mb-1">{name}</p>
                <p className="text-[24px] font-mono font-bold text-[#efeff1] tabular-nums">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Broadcasts ── */}
      <div>
        <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
          Recent Broadcasts
        </h2>
        <div className="bg-[#1a1a1f] border border-[#2a2a35] divide-y divide-[#2a2a35]">
          {data.recent_broadcasts.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#555]">No broadcast content captured yet</div>
          ) : (
            data.recent_broadcasts.map((bc) => (
              <BroadcastRow key={bc.slot_id} broadcast={bc} />
            ))
          )}
        </div>
      </div>

      {/* ── Validation Errors ── */}
      <div>
        <h2 className="text-[12px] font-sans font-bold text-[#7a7a8a] uppercase tracking-[0.14em] mb-3">
          Validation Errors
          <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-[#555]">
            last {data.validation_errors.length}
          </span>
        </h2>
        <div className="bg-[#1a1a1f] border border-[#2a2a35] divide-y divide-[#2a2a35] max-h-[500px] overflow-y-auto">
          {data.validation_errors.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#555]">No validation errors recorded</div>
          ) : (
            data.validation_errors.map((err, i) => (
              <ValidationErrorRow key={`${err.timestamp}-${i}`} error={err} />
            ))
          )}
        </div>
      </div>

    </div>
  )
}

// ── Broadcast Row (expandable) ──

function BroadcastRow({ broadcast }: { broadcast: BroadcastEntry }) {
  const [expanded, setExpanded] = useState(false)

  const formats = Object.entries(broadcast.format_usage)
    .sort(([, a], [, b]) => b - a)
    .map(([fmt, count]) => `${count} ${fmt}`)
    .join(", ")

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#1e1e24] transition-colors text-left"
      >
        <span className="text-[10px] text-[#555] shrink-0 w-[50px]">
          {expanded ? "▼" : "▶"}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-mono font-semibold text-[#00e5b0]">
            {broadcast.streamer_name}
          </span>
          <span className="ml-2 text-[11px] text-[#7a7a8a]">
            {broadcast.slides.length} slide{broadcast.slides.length !== 1 ? "s" : ""}
            {" · "}{broadcast.total_duration}s
          </span>
        </div>
        <span className="text-[10px] text-[#555] shrink-0">{formats}</span>
        <span className="text-[10px] text-[#444] shrink-0">
          {formatDate(broadcast.ended_at)}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pl-[66px]">
          <div className="space-y-1">
            {broadcast.slides.map((slide, i) => (
              <div key={i} className="flex items-center gap-3 text-[11px]">
                <span className="text-[#555] w-4 text-right tabular-nums">{i + 1}</span>
                <span className={`font-mono px-1.5 py-0.5 text-[10px] ${
                  slide.type === "text" ? "bg-[#1e2a1e] text-[#6bc46b]" :
                  slide.type === "build" ? "bg-[#2a1e2a] text-[#c46bc4]" :
                  slide.type === "data" ? "bg-[#1e1e2a] text-[#6b8bc4]" :
                  slide.type === "poll" ? "bg-[#2a2a1e] text-[#c4b06b]" :
                  slide.type === "image" ? "bg-[#2a1e1e] text-[#c46b6b]" :
                  "bg-[#1e1e1e] text-[#adadb8]"
                }`}>
                  {slide.type}
                </span>
                {slide.theme && slide.theme !== "minimal" && (
                  <span className="text-[10px] text-[#7a7a8a]">
                    theme:{slide.theme}
                  </span>
                )}
                <span className="text-[10px] text-[#555]">{slide.duration}s</span>
                {slide.char_count !== undefined && (
                  <span className="text-[10px] text-[#555]">{slide.char_count} chars</span>
                )}
                {slide.row_count !== undefined && (
                  <span className="text-[10px] text-[#555]">{slide.row_count} rows</span>
                )}
                {slide.step_count !== undefined && (
                  <span className="text-[10px] text-[#555]">{slide.step_count} steps</span>
                )}
                {slide.option_count !== undefined && (
                  <span className="text-[10px] text-[#555]">{slide.option_count} options</span>
                )}
                {slide.image_domain && (
                  <span className="text-[10px] text-[#555]">{slide.image_domain}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Validation Error Row (expandable) ──

function ValidationErrorRow({ error }: { error: ValidationError }) {
  const [expanded, setExpanded] = useState(false)

  const typeColor =
    error.error_type === "deprecated_theme" ? "text-[#6bc46b] bg-[#1e2a1e]" :
    error.error_type.includes("image") ? "text-[#c4b06b] bg-[#2a2a1e]" :
    "text-[#c46b6b] bg-[#2a1e1e]"

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#1e1e24] transition-colors text-left"
      >
        <span className={`text-[10px] font-mono px-1.5 py-0.5 shrink-0 ${typeColor}`}>
          {error.error_type}
        </span>
        <span className="text-[11px] font-mono text-[#00e5b0] shrink-0">
          {error.agent_name}
        </span>
        <span className="text-[11px] text-[#adadb8] flex-1 truncate">
          {error.error_message}
        </span>
        <span className="text-[10px] text-[#444] shrink-0">
          {relativeTime(error.timestamp)}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-2.5 pl-[16px]">
          <div className="space-y-1 text-[11px]">
            <p className="text-[#7a7a8a]">
              <span className="text-[#555]">Endpoint:</span> {error.endpoint}
            </p>
            <p className="text-[#7a7a8a]">
              <span className="text-[#555]">Message:</span> {error.error_message}
            </p>
            {error.attempted_value && (
              <p className="text-[#7a7a8a] break-all">
                <span className="text-[#555]">Attempted:</span>{" "}
                <code className="font-mono text-[10px] text-[#adadb8] bg-[#16161a] px-1 py-0.5">
                  {error.attempted_value}
                </code>
              </p>
            )}
          </div>
        </div>
      )}
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
