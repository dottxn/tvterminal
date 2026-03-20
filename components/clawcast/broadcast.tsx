"use client"

import { useEffect, useState } from "react"
import { useBroadcastContext } from "@/lib/broadcast-context"
import type { BroadcastFrame } from "@/hooks/use-broadcast"

// ── Hex color validation ──
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
function validHex(v: unknown): string | undefined {
  return typeof v === "string" && HEX_RE.test(v) ? v : undefined
}

// ── Strip ANSI escape codes ──
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

// ── Text Themes ──

const TEXT_THEMES = {
  minimal: {
    bg: "transparent",
    headline: "#efeff1",
    body: "#adadb8",
    meta: "#6b6b7a",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[clamp(24px,4vw,44px)]",
    glow: false,
  },
  bold: {
    bg: "transparent",
    headline: "#E63946",
    body: "#efeff1",
    meta: "#adadb8",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[clamp(28px,5vw,52px)]",
    glow: false,
  },
  neon: {
    bg: "#080818",
    headline: "#00e5b0",
    body: "#8be9d9",
    meta: "#3d8c7e",
    font: "font-mono",
    headlineFont: "font-mono",
    headlineSize: "text-[clamp(24px,4vw,44px)]",
    glow: true,
  },
  warm: {
    bg: "transparent",
    headline: "#ff7b00",
    body: "#d4a574",
    meta: "#8a6b4e",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[clamp(24px,4vw,44px)]",
    glow: false,
  },
  matrix: {
    bg: "#000000",
    headline: "#00c853",
    body: "#00a844",
    meta: "#006b2b",
    font: "font-mono",
    headlineFont: "font-mono",
    headlineSize: "text-[clamp(24px,4vw,44px)]",
    glow: false,
  },
} as const

type TextThemeName = keyof typeof TEXT_THEMES

// ── View Components ──

function TerminalView({ content, buffer }: { content: BroadcastFrame["content"]; buffer: string }) {
  const text = buffer || content.screen || content.text || ""
  return (
    <pre className="absolute inset-0 p-5 overflow-auto text-[13px] font-mono text-[#e8e8e8] bg-[#0e0e10] whitespace-pre-wrap leading-relaxed">
      {stripAnsi(text)}
    </pre>
  )
}

function TextView({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const themeName = (content.theme as TextThemeName) || "minimal"
  const theme = TEXT_THEMES[themeName] || TEXT_THEMES.minimal

  // Apply overrides on top of theme
  const bgColor = validHex(content.bg_color) || theme.bg
  const headlineColor = validHex(content.text_color) || theme.headline
  const bodyColor = validHex(content.accent_color) || theme.body
  const metaColor = validHex(content.accent_color) || theme.meta

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8 text-center"
      style={bgColor !== "transparent" ? { backgroundColor: bgColor } : undefined}
    >
      <div key={frameKey} className="text-view-enter">
        {content.headline && (
          <h2
            className={`${theme.headlineSize} ${theme.headlineFont} font-bold leading-tight mb-4`}
            style={{
              color: headlineColor,
              ...(theme.glow ? { textShadow: `0 0 20px ${headlineColor}44, 0 0 40px ${headlineColor}22` } : {}),
            }}
          >
            {content.headline}
          </h2>
        )}
        {(content.body || content.text) && (
          <p
            className={`text-[16px] ${theme.font} leading-relaxed max-w-[600px]`}
            style={{ color: bodyColor }}
          >
            {content.body || content.text}
          </p>
        )}
        {content.meta && (
          <span
            className={`mt-4 text-[11px] ${theme.font} block`}
            style={{ color: metaColor }}
          >
            {content.meta}
          </span>
        )}
      </div>
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

// ── Shared frame renderer (used by main viewport + duet halves) ──

function renderFrame(frame: BroadcastFrame, buffer: string, frameKey: string | number) {
  switch (frame.type) {
    case "terminal":
      return <TerminalView content={frame.content} buffer={buffer} />
    case "text":
      return <TextView content={frame.content} frameKey={frameKey} />
    case "data":
      return <DataView content={frame.content} />
    default:
      return <IdleView />
  }
}

// ── Progress Bars (IG Stories style) ──

function BatchProgressBars({ slides, currentIndex }: {
  slides: Array<{ duration_seconds: number }>
  currentIndex: number
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-2 pb-3 pt-1 flex gap-[3px] z-10">
      {slides.map((slide, i) => (
        <div
          key={i}
          className="flex-1 h-[3px] rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <div
            key={i === currentIndex ? `active-${currentIndex}` : `done-${i}`}
            className={
              i < currentIndex
                ? "h-full w-full bg-white rounded-full"
                : i === currentIndex
                  ? "h-full bg-white rounded-full bar-progress"
                  : "h-full w-0 rounded-full"
            }
            style={
              i === currentIndex
                ? { animationDuration: `${slide.duration_seconds}s` }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}

// ── Duet Invite Card ──

function DuetInviteCard({ name, expiresAt }: { name: string; expiresAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return (
    <div className="absolute bottom-4 right-4 bg-[#26262c] border border-[#3d3d4a] px-4 py-3 max-w-[260px] msg-in z-10">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[14px]">🎙</span>
        <span className="text-[12px] font-mono text-[#efeff1]">
          {name} wants a duet partner
        </span>
      </div>
      <div className="h-[2px] bg-[#3a3a48] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#E63946] rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${(remaining / 30) * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-[#6b6b7a] mt-1 block">{remaining}s</span>
    </div>
  )
}

// ── Duet Split Screen Viewport ──

function DuetViewport({
  duetState,
  hostFrame,
  guestFrame,
  hostTerminalBuffer,
  guestTerminalBuffer,
  frameKey,
}: {
  duetState: { host: string; guest: string }
  hostFrame: BroadcastFrame | null
  guestFrame: BroadcastFrame | null
  hostTerminalBuffer: string
  guestTerminalBuffer: string
  frameKey: string | number
}) {
  return (
    <div className="absolute inset-0 flex">
      {/* Host half (left) */}
      <div className="flex-1 relative border-r border-[#2a2a35] flex flex-col">
        <div className="absolute top-2 left-3 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-[#00e5b0]">{duetState.host}</span>
        </div>
        <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#0e0e10]">
          {hostFrame ? renderFrame(hostFrame, hostTerminalBuffer, `host-${frameKey}`) : <IdleView />}
        </div>
      </div>
      {/* Guest half (right) */}
      <div className="flex-1 relative flex flex-col">
        <div className="absolute top-2 left-3 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-[#E63946]">{duetState.guest}</span>
        </div>
        <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#0e0e10]">
          {guestFrame ? renderFrame(guestFrame, guestTerminalBuffer, `guest-${frameKey}`) : <IdleView />}
        </div>
      </div>
    </div>
  )
}

// ── Main Broadcast Component ──

export default function Broadcast() {
  const {
    isLive, currentSlot, latestFrame, terminalBuffer, viewerCount, liveInfo,
    isBatchPlaying, batchSlides, batchIndex,
    duetState, duetRequest, hostFrame, guestFrame, hostTerminalBuffer, guestTerminalBuffer,
  } = useBroadcastContext()

  // Frame key for entrance animations
  const frameKey = isBatchPlaying ? batchIndex : (latestFrame ? `f-${Date.now()}` : "idle")

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
              <span>{duetState ? "Duet" : "Live now"}</span>
              <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#00e5b0] bg-[#00e5b0]/10">
                {displayName}
              </span>
              {duetState && (
                <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#E63946] bg-[#E63946]/10">
                  {duetState.guest}
                </span>
              )}
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

        {/* Duet split screen */}
        {duetState ? (
          <DuetViewport
            duetState={duetState}
            hostFrame={hostFrame ?? null}
            guestFrame={guestFrame ?? null}
            hostTerminalBuffer={hostTerminalBuffer ?? ""}
            guestTerminalBuffer={guestTerminalBuffer ?? ""}
            frameKey={frameKey}
          />
        ) : latestFrame ? (
          renderFrame(latestFrame, terminalBuffer, frameKey)
        ) : (
          <IdleView />
        )}

        {/* Duet invite card */}
        {duetRequest && !duetState && (
          <DuetInviteCard name={duetRequest.streamer_name} expiresAt={duetRequest.expires_at} />
        )}

        {/* Batch progress bars (only outside duet) */}
        {!duetState && isBatchPlaying && batchSlides.length > 0 && (
          <BatchProgressBars slides={batchSlides} currentIndex={batchIndex} />
        )}
      </div>
    </section>
  )
}
