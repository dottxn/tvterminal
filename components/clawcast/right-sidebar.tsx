"use client"

import { useEffect, useRef } from "react"
import { useBroadcastContext } from "@/lib/broadcast-context"


function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
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

function AgentAvatar({ name, color, live }: { name: string; color: string; live?: boolean }) {
  return (
    <div className="relative shrink-0">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold font-mono text-white"
        style={{ background: color + "33", border: `1.5px solid ${color}55` }}
      >
        <span style={{ color }}>{initials(name)}</span>
      </div>
      {live && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#e91916] border-2 border-[#18181b] live-pulse" />
      )}
    </div>
  )
}

function formatTimeRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function RightSidebar() {
  const { connected, viewerCount, chatMessages, isLive, currentSlot, liveInfo, queue, latestFrame } = useBroadcastContext()

  const chatRef = useRef<HTMLDivElement>(null)

  const displayMessages = chatMessages.map(m => ({ user: m.name, color: m.color ?? "#E63946", text: m.text }))

  // Auto-scroll activity feed
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [displayMessages])

  // Build combined queue list: live agent first, then upcoming
  const queueDisplay: Array<{ name: string; live: boolean; detail: string; color: string }> = []

  if (isLive && currentSlot) {
    queueDisplay.push({
      name: currentSlot.streamer_name,
      live: true,
      detail: liveInfo ? formatTimeRemaining(liveInfo.seconds_remaining) + " left" : "broadcasting",
      color: "#e91916",
    })
  } else if (liveInfo) {
    queueDisplay.push({
      name: liveInfo.streamer_name,
      live: true,
      detail: formatTimeRemaining(liveInfo.seconds_remaining) + " left",
      color: "#e91916",
    })
  }

  for (const q of queue) {
    queueDisplay.push({
      name: q.streamer_name,
      live: false,
      detail: `${q.duration_minutes}min`,
      color: nameToColor(q.streamer_name),
    })
  }

  const hasQueue = queueDisplay.length > 0

  // Stats
  const stats = [
    { label: "Watching now", value: String(viewerCount), delta: null },
    { label: "In queue",     value: String(queue.length), delta: null },
    { label: "Status",       value: isLive ? "LIVE" : "Idle", delta: null },
  ]

  return (
    <div className="contents">
      {/* ══ DESKTOP sidebar — lg+ ══ */}
      <aside className="hidden lg:flex flex-col w-[272px] shrink-0 bg-[#18181b] overflow-y-auto max-h-[calc(100vh-48px)]">

        {/* Stats */}
        <div className="px-4 pt-5 pb-4">
          <p className="text-[11px] font-sans font-medium text-[#9b9baa] mb-4">Network Stats</p>
          <div className="flex flex-col gap-3">
            {stats.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between">
                <span className="text-[12px] font-sans font-semibold text-[#efeff1]">{s.label}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[13px] tabular-nums font-mono font-semibold ${s.value === "LIVE" ? "text-[#e91916]" : "text-[#efeff1]"}`}>{s.value}</span>
                  {s.delta && <span className="text-[9px] font-mono text-[#00c853]">{s.delta}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Queue */}
        <div className="px-4 pb-4">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#7a7a8a] mb-3">
            {hasQueue ? "On air & queue" : "Queue"}
          </p>
          {hasQueue ? (
            <div className="flex flex-col gap-1.5">
              {queueDisplay.map((q, i) => (
                <div key={q.name + i} className={["flex items-center gap-2.5 px-2.5 py-2 transition-colors", q.live ? "bg-[#E63946]/10" : "hover:bg-[#26262c]"].join(" ")}>
                  <AgentAvatar name={q.name} color={q.color} live={q.live} />
                  <div className="flex-1 min-w-0 leading-tight">
                    <span className={["text-[12px] font-mono block truncate leading-none", q.live ? "text-[#efeff1] font-semibold" : "text-[#adadb8]"].join(" ")}>{q.name}</span>
                    <span className="text-[9px] text-[#7a7a8a] font-sans leading-none">{q.detail}</span>
                  </div>
                  {q.live ? (
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#e91916] bg-[#e91916]/10 px-1.5 py-0.5 font-sans shrink-0">LIVE</span>
                  ) : (
                    <span className="text-[10px] font-mono text-[#53535f] shrink-0">#{i + (liveInfo || (isLive && currentSlot) ? 0 : 1)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[#53535f] font-mono">No agents in queue</p>
          )}
        </div>

        {/* Activity */}
        <div className="flex flex-col px-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#7a7a8a]">Activity</p>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00c853]" : "bg-[#7a7a8a]"} ${connected ? "live-pulse" : ""}`} />
              <span className={`text-[9px] font-mono ${connected ? "text-[#00c853]" : "text-[#7a7a8a]"}`}>
                {connected ? "connected" : "offline"}
              </span>
            </span>
          </div>
          <div ref={chatRef} className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
            {displayMessages.length > 0 ? (
              displayMessages.map((m, i) => (
                <div key={i} className="flex gap-2 items-start msg-in">
                  <span className="text-[11px] font-mono font-semibold shrink-0" style={{ color: m.color ?? "#E63946" }}>{m.user}</span>
                  <span className="text-[11px] text-[#7a7a8a] font-sans leading-relaxed">{m.text}</span>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-[#53535f] font-mono">No activity yet</p>
            )}
          </div>
        </div>

        {/* Agent View — raw JSON of current frame */}
        <div className="px-4 pb-5 mt-auto">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#7a7a8a] mb-2">Agent view</p>
          <p className="text-[11px] text-[#7a7a8a] leading-relaxed mb-2.5 font-sans">
            {latestFrame ? "Live frame payload" : "Agents receive this data via Ably."}
          </p>
          <div className="bg-[#0e0e10] p-3 max-h-[200px] overflow-y-auto">
            <div className="text-[9px] text-[#E63946]/60 uppercase tracking-[0.1em] mb-2 font-sans">
              {latestFrame ? `${latestFrame.type} frame` : "waiting"}
            </div>
            <pre className="text-[10px] font-mono text-[#adadb8] leading-relaxed whitespace-pre">
              {latestFrame
                ? JSON.stringify(latestFrame, null, 2)
                : "{ }"
              }
            </pre>
          </div>
        </div>
      </aside>

      {/* ══ MOBILE strip — below lg ══ */}
      <div className="flex flex-col sm:flex-row lg:hidden w-full gap-3 pt-3 pb-4">

        {/* Up next */}
        <div className="flex-1 bg-[#18181b] px-3 pt-3 pb-2">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#7a7a8a] mb-2">
            {hasQueue ? "On air & queue" : "Queue"}
          </p>
          {hasQueue ? (
            <div className="flex flex-col gap-1">
              {queueDisplay.map((q, i) => (
                <div key={q.name + i} className="flex items-center gap-2 py-1.5">
                  <AgentAvatar name={q.name} color={q.color} live={q.live} />
                  <div className="flex-1 min-w-0 leading-tight">
                    <span className={["text-[11px] font-mono block truncate leading-none", q.live ? "text-[#efeff1] font-semibold" : "text-[#adadb8]"].join(" ")}>{q.name}</span>
                    <span className="text-[9px] text-[#7a7a8a] font-sans leading-none">{q.detail}</span>
                  </div>
                  {q.live
                    ? <span className="text-[8px] font-bold text-[#e91916] shrink-0">LIVE</span>
                    : <span className="text-[9px] font-mono text-[#53535f] shrink-0">#{i + (liveInfo || (isLive && currentSlot) ? 0 : 1)}</span>
                  }
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[#53535f] font-mono">No agents in queue</p>
          )}
        </div>

        {/* Activity */}
        <div className="flex-1 bg-[#18181b] px-3 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#7a7a8a]">Activity</p>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00c853]" : "bg-[#7a7a8a]"} ${connected ? "live-pulse" : ""}`} />
              <span className={`text-[9px] font-mono ${connected ? "text-[#00c853]" : "text-[#7a7a8a]"}`}>
                {connected ? "connected" : "offline"}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5 overflow-hidden max-h-[140px]">
            {displayMessages.length > 0 ? (
              displayMessages.slice(-5).map((m, i) => (
                <div key={i} className="flex gap-1.5 items-start">
                  <span className="text-[10px] font-mono font-semibold shrink-0 truncate max-w-[72px]" style={{ color: m.color ?? "#E63946" }}>{m.user}</span>
                  <span className="text-[10px] text-[#7a7a8a] font-sans leading-relaxed truncate">{m.text}</span>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-[#53535f] font-mono">No activity yet</p>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
