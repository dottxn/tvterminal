"use client"

import { useBroadcastContext } from "@/lib/broadcast-context"
import type { BroadcastFrame, BatchSlide, ActivePoll } from "@/hooks/use-broadcast"

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
    meta: "#7a7a8a",
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
          <span className="text-[12px] font-sans text-[#7a7a8a]">{row.label}</span>
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

function ImageView({ content, frameKey }: { content: BroadcastFrame["content"]; frameKey: string | number }) {
  const imageUrl = content.image_url
  const caption = content.caption

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e10]">
      <div key={frameKey} className="text-view-enter relative w-full h-full flex items-center justify-center">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={caption || ""}
            className="max-w-full max-h-full object-contain"
          />
        )}
        {caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-10">
            <p className="text-[14px] font-sans text-[#efeff1] leading-relaxed text-center">
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Poll Components ──

function PollOption({ label, index, total, percentage, isVoted, isUserChoice, onVote }: {
  label: string
  index: number
  total: number
  percentage: number
  isVoted: boolean
  isUserChoice: boolean
  onVote: () => void
}) {
  return (
    <button
      onClick={onVote}
      disabled={isVoted}
      className={`relative w-full text-left min-h-[44px] px-4 py-3 overflow-hidden transition-all duration-200 ${
        isVoted
          ? "cursor-default"
          : "cursor-pointer hover:bg-[#2a2a35]/60 active:scale-[0.99]"
      } ${
        isUserChoice
          ? "border border-[#00e5b0]/50"
          : "border border-[#2a2a35]"
      }`}
    >
      {/* Result bar (shown after voting) */}
      {isVoted && (
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: isUserChoice ? "rgba(0, 229, 176, 0.15)" : "rgba(255, 255, 255, 0.06)",
          }}
        />
      )}

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className={`text-[14px] font-sans ${isUserChoice ? "text-[#00e5b0]" : "text-[#efeff1]"}`}>
          {label}
        </span>
        {isVoted && (
          <span className={`text-[12px] font-mono tabular-nums shrink-0 ${isUserChoice ? "text-[#00e5b0]" : "text-[#7a7a8a]"}`}>
            {percentage}%{isUserChoice ? " ✓" : ""}
          </span>
        )}
      </div>
    </button>
  )
}

function PollView({ content, frameKey, activePoll, onVote }: {
  content: BroadcastFrame["content"]
  frameKey: string | number
  activePoll: ActivePoll | null
  onVote: (pollId: string, optionIndex: number) => void
}) {
  const question = content.question || ""
  const options = content.options || []
  const pollId = content.poll_id || ""
  const results = activePoll?.results || new Array(options.length).fill(0)
  const totalVotes = results.reduce((a: number, b: number) => a + b, 0)
  const isVoted = activePoll?.voted || false

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e10]">
      <div key={frameKey} className="text-view-enter w-full max-w-[500px] px-6">
        {/* Question */}
        <h2 className="text-[clamp(18px,3vw,24px)] font-sans font-semibold text-[#efeff1] text-center mb-6 leading-tight">
          {question}
        </h2>

        {/* Options */}
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => (
            <PollOption
              key={i}
              label={opt}
              index={i}
              total={totalVotes}
              percentage={totalVotes > 0 ? Math.round((results[i] / totalVotes) * 100) : 0}
              isVoted={isVoted}
              isUserChoice={activePoll?.votedIndex === i}
              onVote={() => onVote(pollId, i)}
            />
          ))}
        </div>

        {/* Vote count */}
        <p className="text-[11px] font-mono text-[#7a7a8a] text-center mt-4">
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </p>
      </div>
    </div>
  )
}

// ── Duet Turn Bubble ──

function DuetTurnBubble({ speakerName, speakerRole, text, isCurrent, animateIn }: {
  speakerName: string
  speakerRole: string
  text: string
  isCurrent: boolean
  animateIn: boolean
}) {
  const isHost = speakerRole === "host"
  const color = isHost ? "#00e5b0" : "#E63946"
  const label = isHost ? "HOST" : "GUEST"

  return (
    <div className={`${animateIn ? "text-view-enter" : ""} transition-opacity duration-300`}
      style={{ opacity: isCurrent ? 1 : 0.4 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ color, backgroundColor: color + "15" }}
        >
          {label}
        </span>
        <span className="text-[12px] font-mono text-[#7a7a8a]">{speakerName}</span>
      </div>
      <p className={`font-sans leading-relaxed text-[#efeff1] ${isCurrent ? "text-[18px]" : "text-[15px]"}`}>
        {text}
      </p>
    </div>
  )
}

// ── Typing Indicator ──

function TypingIndicator({ speakerName }: { speakerName: string }) {
  return (
    <div className="text-view-enter">
      <span className="text-[12px] font-mono text-[#7a7a8a] mb-1 block">{speakerName}</span>
      <div className="flex items-center gap-1.5 py-1">
        <span className="w-2 h-2 rounded-full bg-[#7a7a8a] animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
        <span className="w-2 h-2 rounded-full bg-[#7a7a8a] animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.8s" }} />
        <span className="w-2 h-2 rounded-full bg-[#7a7a8a] animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.8s" }} />
      </div>
    </div>
  )
}

// ── Duet Slide View (threaded conversation with previous turns visible) ──

function DuetSlideView({ content, frameKey, allSlides, currentIndex, isTyping }: {
  content: BroadcastFrame["content"]
  frameKey: string | number
  allSlides: BatchSlide[]
  currentIndex: number
  isTyping: boolean
}) {
  // Collect all duet slides that come before the current batch index
  const previousTurns: Array<{ speaker_name: string; speaker_role: string; text: string }> = []
  for (let i = 0; i < currentIndex; i++) {
    if (allSlides[i]?.type === "duet") {
      const c = allSlides[i].content as Record<string, unknown>
      previousTurns.push({
        speaker_name: c.speaker_name as string,
        speaker_role: c.speaker_role as string,
        text: c.text as string,
      })
    }
  }

  // Figure out next speaker for typing indicator
  const nextSlide = allSlides[currentIndex + 1]
  const nextSpeaker = nextSlide?.type === "duet"
    ? (nextSlide.content as Record<string, unknown>).speaker_name as string
    : null

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-8 py-10 gap-4 overflow-y-auto">
        {/* Duet header */}
        <div className="max-w-[600px] w-full mx-auto">
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#7a7a8a]">
            Duet — {content.host_name} × {content.guest_name}
          </span>
        </div>

        {/* Previous turns (faded) */}
        {previousTurns.map((turn, i) => (
          <div key={`prev-${i}`} className="max-w-[600px] w-full mx-auto">
            <DuetTurnBubble
              speakerName={turn.speaker_name}
              speakerRole={turn.speaker_role}
              text={turn.text}
              isCurrent={false}
              animateIn={false}
            />
          </div>
        ))}

        {/* Current turn */}
        <div key={frameKey} className="max-w-[600px] w-full mx-auto">
          <DuetTurnBubble
            speakerName={content.speaker_name ?? "Unknown"}
            speakerRole={content.speaker_role ?? "host"}
            text={content.text ?? ""}
            isCurrent={true}
            animateIn={true}
          />
        </div>

        {/* Typing indicator for next speaker */}
        {isTyping && nextSpeaker && (
          <div className="max-w-[600px] w-full mx-auto">
            <TypingIndicator speakerName={nextSpeaker} />
          </div>
        )}
      </div>
    </div>
  )
}

function IdleView() {
  return (
    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#53535f]">
      waiting for broadcast
    </span>
  )
}

// ── Extract effective bg color from a frame ──

function getFrameBgColor(frame: BroadcastFrame | null): string | undefined {
  if (!frame) return undefined
  if (frame.type === "data" || frame.type === "terminal" || frame.type === "image" || frame.type === "poll") return "#0e0e10"
  if (frame.type === "duet") return undefined // duets use default dark bg
  if (frame.type !== "text") return undefined
  const themeName = (frame.content.theme as TextThemeName) || "minimal"
  const theme = TEXT_THEMES[themeName] || TEXT_THEMES.minimal
  const bgColor = validHex(frame.content.bg_color) || theme.bg
  if (frame.content.gif_url) return undefined
  return bgColor !== "transparent" ? bgColor : undefined
}

// ── Shared frame renderer ──

function renderFrame(
  frame: BroadcastFrame,
  buffer: string,
  frameKey: string | number,
  duetContext?: { allSlides: BatchSlide[]; currentIndex: number; isTyping: boolean },
  pollContext?: { activePoll: ActivePoll | null; onVote: (pollId: string, optionIndex: number) => void },
) {
  switch (frame.type) {
    case "terminal":
      return <TerminalView content={frame.content} buffer={buffer} />
    case "text":
      return <TextView content={frame.content} frameKey={frameKey} />
    case "data":
      return <DataView content={frame.content} />
    case "image":
      return <ImageView content={frame.content} frameKey={frameKey} />
    case "poll":
      return (
        <PollView
          content={frame.content}
          frameKey={frameKey}
          activePoll={pollContext?.activePoll ?? null}
          onVote={pollContext?.onVote ?? (() => {})}
        />
      )
    case "duet":
      return (
        <DuetSlideView
          content={frame.content}
          frameKey={frameKey}
          allSlides={duetContext?.allSlides ?? []}
          currentIndex={duetContext?.currentIndex ?? 0}
          isTyping={duetContext?.isTyping ?? false}
        />
      )
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

// ── Main Broadcast Component ──

export default function Broadcast() {
  const {
    isLive, currentSlot, latestFrame, terminalBuffer, viewerCount, liveInfo,
    isBatchPlaying, batchSlides, batchIndex, isDuetTyping,
    activePoll, vote, duetNotification,
  } = useBroadcastContext()

  // Frame key for entrance animations
  const frameKey = isBatchPlaying ? batchIndex : (latestFrame ? `f-${Date.now()}` : "idle")

  // Viewport background from current frame
  const viewportBg = getFrameBgColor(latestFrame)

  // Check if current slide is a duet or poll (for info bar label)
  const isDuetSlide = isBatchPlaying && batchSlides[batchIndex]?.type === "duet"
  const isPollSlide = latestFrame?.type === "poll"

  // Build duet context for the renderer
  const duetContext = isDuetSlide
    ? { allSlides: batchSlides, currentIndex: batchIndex, isTyping: isDuetTyping }
    : undefined

  // Build poll context for the renderer
  const pollContext = isPollSlide
    ? { activePoll, onVote: vote }
    : undefined

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
          isLive || liveInfo ? "live-pulse bg-[#e91916]" : "bg-[#53535f]"
        }`} />

        {/* label + chips */}
        <div className="flex items-center gap-3 text-[13px] text-[#7a7a8a] font-sans">
          {displayName ? (
            <>
              <span>{isDuetSlide ? "Duet" : isPollSlide ? "Poll" : "Live now"}</span>
              <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#00e5b0] bg-[#00e5b0]/10">
                {displayName}
              </span>
              {isDuetSlide && batchSlides[batchIndex]?.content && (
                <span className="px-3 py-1 text-[12px] font-mono font-semibold text-[#E63946] bg-[#E63946]/10">
                  {(batchSlides[batchIndex].content as Record<string, unknown>).guest_name as string ?? ""}
                </span>
              )}
              {liveInfo && (
                <span className="text-[11px] font-mono text-[#7a7a8a] tabular-nums">
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

        {latestFrame ? (
          renderFrame(latestFrame, terminalBuffer, frameKey, duetContext, pollContext)
        ) : (
          <IdleView />
        )}

        {/* Batch progress bars */}
        {isBatchPlaying && batchSlides.length > 0 && (
          <BatchProgressBars slides={batchSlides} currentIndex={batchIndex} />
        )}

        {/* Duet negotiation toast */}
        {duetNotification && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-view-enter">
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#1a1a1f]/95 border border-[#00e5b0]/30 backdrop-blur-sm shadow-lg">
              <span className="w-2 h-2 rounded-full bg-[#00e5b0] animate-pulse shrink-0" />
              <span className="text-[12px] font-mono font-semibold text-[#00e5b0]">{duetNotification.name}</span>
              <span className="text-[12px] font-sans text-[#adadb8]">{duetNotification.text}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
