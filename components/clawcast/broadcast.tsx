"use client"

import { useBroadcastContext } from "@/lib/broadcast-context"
import type { BroadcastFrame } from "@/hooks/use-broadcast"

// Strip ANSI escape codes for clean rendering
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

function TerminalView({ content, buffer }: { content: BroadcastFrame["content"]; buffer: string }) {
  const text = buffer || content.screen || content.text || ""
  return (
    <pre className="absolute inset-0 p-5 overflow-auto text-[13px] font-mono text-[#e8e8e8] bg-[#0e0e10] whitespace-pre-wrap leading-relaxed">
      {stripAnsi(text)}
    </pre>
  )
}

function TextView({ content }: { content: BroadcastFrame["content"] }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      {content.headline && (
        <h2 className="text-[clamp(24px,4vw,44px)] font-sans font-bold text-[#efeff1] leading-tight mb-4">
          {content.headline}
        </h2>
      )}
      {(content.body || content.text) && (
        <p className="text-[16px] font-mono text-[#adadb8] leading-relaxed max-w-[600px]">
          {content.body || content.text}
        </p>
      )}
      {content.meta && (
        <span className="mt-4 text-[11px] font-mono text-[#6b6b7a]">
          {content.meta}
        </span>
      )}
    </div>
  )
}

function DataView({ content }: { content: BroadcastFrame["content"] }) {
  return (
    <div className="flex flex-col gap-2 p-6 w-full max-w-[500px] mx-auto my-auto">
      {content.rows?.map((row, i) => (
        <div key={i} className="flex justify-between items-baseline py-2 border-b border-[#2a2a35]">
          <span className="text-[12px] font-sans text-[#6b6b7a]">{row.label}</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-mono text-[#efeff1] tabular-nums">{row.value}</span>
            {row.change && (
              <span className={`text-[10px] font-mono ${row.change.startsWith("+") ? "text-[#00c853]" : "text-[#e91916]"}`}>
                {row.change}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function IdleView() {
  return (
    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a48]">
      waiting for broadcast
    </span>
  )
}

export default function Broadcast() {
  const { isLive, currentSlot, latestFrame, terminalBuffer, viewerCount, liveInfo } = useBroadcastContext()

  // Decide what to show in the info bar
  const showLive = isLive && currentSlot
  const displayName = showLive
    ? currentSlot.streamer_name
    : liveInfo
      ? liveInfo.streamer_name
      : null

  return (
    <section className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Info Bar ── */}
      <div className="flex items-center gap-4 px-5 h-16 bg-[#18181b] shrink-0">

        {/* live dot */}
        <span className={`inline-block w-[10px] h-[10px] rounded-full shrink-0 ${
          isLive || liveInfo ? "live-pulse bg-[#e91916]" : "bg-[#3a3a48]"
        }`} />

        {/* label + chips */}
        <div className="flex items-center gap-3 text-[13px] text-[#6b6b7a] font-sans">
          {displayName ? (
            <>
              <span>Live now</span>
              <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#00e5b0] bg-[#00e5b0]/10">
                {displayName}
              </span>
              {liveInfo && (
                <span className="text-[11px] font-mono text-[#6b6b7a] tabular-nums">
                  {Math.floor(liveInfo.seconds_remaining / 60)}:{String(liveInfo.seconds_remaining % 60).padStart(2, "0")} left
                </span>
              )}
            </>
          ) : (
            <span>No broadcast</span>
          )}
        </div>

        {/* viewers */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-[#adadb8]">
            <rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
            <path d="M12 2v4M10 8V6M14 8V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 20v1M16 20v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-[13px] text-[#adadb8] font-mono tabular-nums">{viewerCount}</span>
        </div>
      </div>

      {/* ── Viewport — 16:9 ── */}
      <div className="relative w-full aspect-video bg-[#0e0e10] flex items-center justify-center overflow-hidden">
        {latestFrame ? (
          latestFrame.type === "terminal" ? (
            <TerminalView content={latestFrame.content} buffer={terminalBuffer} />
          ) : latestFrame.type === "text" ? (
            <TextView content={latestFrame.content} />
          ) : latestFrame.type === "data" ? (
            <DataView content={latestFrame.content} />
          ) : (
            <IdleView />
          )
        ) : (
          <IdleView />
        )}
      </div>
    </section>
  )
}
