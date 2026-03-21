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
    headlineSize: "text-[clamp(24px,3.5vw,36px)]",
    headlineWeight: "font-normal",
    headlineTransform: "",
    headlineTracking: "",
    bodySize: "text-[16px]",
    bodyWeight: "font-normal",
    textAlign: "center" as const,
    padding: "p-8",
    glow: false,
    decor: null as "underline" | "quotes" | null,
    bodyPrefix: "",
  },
  bold: {
    bg: "transparent",
    headline: "#E63946",
    body: "#efeff1",
    meta: "#adadb8",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[clamp(28px,5vw,52px)]",
    headlineWeight: "font-black",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-tight",
    bodySize: "text-[18px]",
    bodyWeight: "font-semibold",
    textAlign: "center" as const,
    padding: "p-8",
    glow: false,
    decor: "underline" as const,
    bodyPrefix: "",
  },
  neon: {
    bg: "#080818",
    headline: "#00e5b0",
    body: "#8be9d9",
    meta: "#3d8c7e",
    font: "font-mono",
    headlineFont: "font-mono",
    headlineSize: "text-[clamp(24px,4vw,40px)]",
    headlineWeight: "font-light",
    headlineTransform: "",
    headlineTracking: "tracking-widest",
    bodySize: "text-[15px]",
    bodyWeight: "font-light",
    textAlign: "center" as const,
    padding: "p-12",
    glow: true,
    decor: null as null,
    bodyPrefix: "",
  },
  warm: {
    bg: "#1a0f08",
    headline: "#ff7b00",
    body: "#d4a574",
    meta: "#8a6b4e",
    font: "font-sans",
    headlineFont: "font-sans",
    headlineSize: "text-[clamp(24px,4vw,38px)]",
    headlineWeight: "font-medium",
    headlineTransform: "",
    headlineTracking: "",
    bodySize: "text-[17px]",
    bodyWeight: "font-light",
    textAlign: "left" as const,
    padding: "pl-12 pr-8 py-8",
    glow: false,
    decor: "quotes" as const,
    bodyPrefix: "",
  },
  matrix: {
    bg: "#000000",
    headline: "#00c853",
    body: "#00a844",
    meta: "#006b2b",
    font: "font-mono",
    headlineFont: "font-mono",
    headlineSize: "text-[clamp(20px,3vw,32px)]",
    headlineWeight: "font-bold",
    headlineTransform: "uppercase",
    headlineTracking: "tracking-wide",
    bodySize: "text-[14px]",
    bodyWeight: "font-normal",
    textAlign: "left" as const,
    padding: "pl-10 pr-8 py-8",
    glow: false,
    decor: null as null,
    bodyPrefix: "> ",
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
  const headlineColor = validHex(content.text_color) || theme.headline
  const bodyColor = validHex(content.accent_color) || theme.body
  const metaColor = validHex(content.accent_color) || theme.meta
  const gifUrl = typeof content.gif_url === "string" ? content.gif_url : undefined
  const isLeft = theme.textAlign === "left"

  return (
    <div className={`relative flex flex-col ${isLeft ? "items-start" : "items-center"} justify-center h-full ${theme.padding} ${isLeft ? "text-left" : "text-center"}`}>
      {/* GIF background + overlay */}
      {gifUrl && (
        <>
          <img src={gifUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}

      <div key={frameKey} className="text-view-enter relative z-10 max-w-[700px]">
        {/* Quote decoration (warm theme) */}
        {theme.decor === "quotes" && content.headline && (
          <span className="text-[64px] leading-none opacity-25 block -mb-6" style={{ color: headlineColor }}>{"\u201C"}</span>
        )}

        {content.headline && (
          <h2
            className={`${theme.headlineSize} ${theme.headlineFont} ${theme.headlineWeight} ${theme.headlineTransform} ${theme.headlineTracking} leading-tight mb-4`}
            style={{
              color: headlineColor,
              ...(theme.glow ? { textShadow: `0 0 20px ${headlineColor}44, 0 0 40px ${headlineColor}22` } : {}),
            }}
          >
            {content.headline}
          </h2>
        )}

        {/* Underline decoration (bold theme) */}
        {theme.decor === "underline" && content.headline && (
          <span className="block mb-4 h-[3px] w-16 rounded-full" style={{ backgroundColor: headlineColor, ...(isLeft ? {} : { margin: "0 auto 16px" }) }} />
        )}

        {(content.body || content.text) && (
          <p
            className={`${theme.bodySize} ${theme.font} ${theme.bodyWeight} leading-relaxed max-w-[600px]`}
            style={{ color: bodyColor }}
          >
            {theme.bodyPrefix && <span className="opacity-50">{theme.bodyPrefix}</span>}
            {content.body || content.text}
          </p>
        )}

        {content.meta && (
          <span className={`mt-4 text-[11px] ${theme.font} block`} style={{ color: metaColor }}>
            {content.meta}
          </span>
        )}
      </div>
    </div>
  )
}

function DataView({ content }: { content: BroadcastFrame["content"] }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e10]">
    <div className="flex flex-col gap-2 p-6 w-full max-w-[500px]">
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

// ── Extract effective bg color from a frame ──

function getFrameBgColor(frame: BroadcastFrame | null): string | undefined {
  if (!frame) return undefined
  // Data and terminal frames use a fixed dark bg
  if (frame.type === "data" || frame.type === "terminal") return "#0e0e10"
  if (frame.type !== "text") return undefined
  const themeName = (frame.content.theme as TextThemeName) || "minimal"
  const theme = TEXT_THEMES[themeName] || TEXT_THEMES.minimal
  const bgColor = validHex(frame.content.bg_color) || theme.bg
  // If there's a gif, don't apply theme bg (gif fills viewport)
  if (frame.content.gif_url) return undefined
  return bgColor !== "transparent" ? bgColor : undefined
}

// ── Shared frame renderer (used by main viewport + duet conversation) ──

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

function DuetInviteCard({ name, question, expiresAt }: { name: string; question: string; expiresAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return (
    <div className="absolute bottom-4 right-4 bg-[#1a1a22]/90 backdrop-blur-md border border-[#3d3d4a]/50 rounded-lg px-4 py-3 max-w-[300px] msg-in z-10 shadow-lg shadow-black/30">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-[#00e5b0] animate-pulse" />
        <span className="text-[11px] font-mono font-semibold text-[#efeff1] tracking-wide uppercase">
          Duet Request
        </span>
      </div>
      <span className="text-[12px] font-mono text-[#adadb8] block mb-1">
        {name}
      </span>
      {question && (
        <p className="text-[13px] font-sans text-[#efeff1]/80 leading-snug mb-2 italic">
          {"\u201C"}{question.length > 120 ? question.slice(0, 120) + "..." : question}{"\u201D"}
        </p>
      )}
      <div className="h-[2px] bg-[#3a3a48] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#00e5b0] rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${(remaining / 30) * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-[#6b6b7a] mt-1 block">{remaining}s remaining</span>
    </div>
  )
}

// ── Duet Conversation (3-turn structured Q→A→Reply) ──

function DuetConversation({
  duetState,
  duetReply,
  duetTurn,
}: {
  duetState: { host: string; guest: string; question: string; answer: string }
  duetReply: string | null
  duetTurn: number
}) {
  const turns = [
    { speaker: duetState.host, text: duetState.question, color: "#00e5b0", label: "HOST" },
    { speaker: duetState.guest, text: duetState.answer, color: "#E63946", label: "GUEST" },
    ...(duetReply ? [{ speaker: duetState.host, text: duetReply, color: "#00e5b0", label: "HOST" }] : []),
  ]

  // Determine if someone is "typing" (next turn hasn't arrived yet)
  const isWaitingForNext =
    (duetTurn === 1 && turns.length < 2) || // Waiting for guest answer
    (duetTurn === 2 && !duetReply) ||        // Waiting for host reply
    false

  // Who's typing next?
  const nextSpeaker = duetTurn === 1 ? duetState.guest : duetState.host
  const nextColor = duetTurn === 1 ? "#E63946" : "#00e5b0"

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Conversation cards */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 gap-5">
        {turns.map((turn, i) => {
          if (i + 1 > duetTurn) return null
          const isCurrent = i + 1 === duetTurn
          return (
            <div
              key={i}
              className={`max-w-[600px] w-full ${isCurrent ? "text-view-enter" : ""}`}
              style={{ opacity: isCurrent ? 1 : 0.35, margin: "0 auto" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: turn.color, backgroundColor: turn.color + "15" }}
                >
                  {turn.label}
                </span>
                <span className="text-[12px] font-mono text-[#6b6b7a]">{turn.speaker}</span>
              </div>
              <p className={`${isCurrent ? "text-[18px]" : "text-[15px]"} font-sans leading-relaxed text-[#efeff1]`}>
                {turn.text}
              </p>
            </div>
          )
        })}

        {/* Typing indicator — shows when waiting for next turn */}
        {isWaitingForNext && (
          <div className="max-w-[600px] w-full text-view-enter" style={{ margin: "0 auto" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ color: nextColor, backgroundColor: nextColor + "15" }}
              >
                {nextSpeaker}
              </span>
            </div>
            <div className="flex items-center gap-[5px] h-[28px]" style={{ color: nextColor }}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Broadcast Component ──

export default function Broadcast() {
  const {
    isLive, currentSlot, latestFrame, terminalBuffer, viewerCount, liveInfo,
    isBatchPlaying, batchSlides, batchIndex,
    duetState, duetRequest, duetReply, duetTurn,
  } = useBroadcastContext()

  // Frame key for entrance animations
  const frameKey = isBatchPlaying ? batchIndex : (latestFrame ? `f-${Date.now()}` : "idle")

  // Viewport background from current frame (theme bg fills entire viewport)
  const viewportBg = !duetState ? getFrameBgColor(latestFrame) : undefined

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
      <div
        className="relative w-full aspect-video bg-[#0e0e10] flex items-center justify-center overflow-hidden transition-colors duration-300"
        style={viewportBg ? { backgroundColor: viewportBg } : undefined}
      >

        {/* Duet conversation */}
        {duetState ? (
          <DuetConversation
            duetState={duetState}
            duetReply={duetReply ?? null}
            duetTurn={duetTurn ?? 0}
          />
        ) : latestFrame ? (
          renderFrame(latestFrame, terminalBuffer, frameKey)
        ) : (
          <IdleView />
        )}

        {/* Duet invite card */}
        {duetRequest && !duetState && (
          <DuetInviteCard name={duetRequest.streamer_name} question={duetRequest.question ?? ""} expiresAt={duetRequest.expires_at} />
        )}

        {/* Batch progress bars (only outside duet) */}
        {!duetState && isBatchPlaying && batchSlides.length > 0 && (
          <BatchProgressBars slides={batchSlides} currentIndex={batchIndex} />
        )}
      </div>
    </section>
  )
}
