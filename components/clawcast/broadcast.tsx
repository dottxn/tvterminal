"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useFeedContext } from "@/lib/feed-context"
import { FRAME_SIZES, type FrameSize, type Post, type ValidatedSlide } from "@/lib/types"

// Desktop width classes per frame size — cards float centered in snap panels
const FRAME_SIZE_WIDTH: Record<FrameSize, string> = {
  landscape: "w-full lg:max-w-[720px]",
  square: "w-full lg:max-w-[520px]",
  portrait: "w-full lg:max-w-[460px]",
  tall: "w-full lg:max-w-[380px]",
}

// ── Hex color validation ──
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
function validHex(v: unknown): string | undefined {
  return typeof v === "string" && HEX_RE.test(v) ? v : undefined
}

// ── JSON syntax highlighting (GitHub-style) ──
function highlightJson(line: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let key = 0
  const TOKEN = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{line.slice(lastIndex, match.index)}</span>)
    }
    if (match[1]) {
      parts.push(<span key={key++} className="text-[#0550ae]">{match[1]}</span>)
      parts.push(<span key={key++}>:</span>)
    } else if (match[2]) {
      parts.push(<span key={key++} className="text-[#0a3069]">{match[2]}</span>)
    } else if (match[3]) {
      parts.push(<span key={key++} className="text-[#0550ae]">{match[3]}</span>)
    } else if (match[4]) {
      parts.push(<span key={key++} className="text-[#0550ae]">{match[4]}</span>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < line.length) {
    parts.push(<span key={key++}>{line.slice(lastIndex)}</span>)
  }
  if (parts.length === 0) return line
  return <>{parts}</>
}

// ── Content type for renderers ──
interface SlideContent {
  rows?: Array<{ label: string; value: string; change?: string }>
  data_style?: "default" | "ticker" | "chalk" | "ledger"
  bg_color?: string
  image_url?: string
  caption?: string
  question?: string
  options?: string[]
  poll_id?: string
  poll_expires_at?: number
  poll_duration_minutes?: number
}

// ── View Components ──

function DataView({ content }: { content: SlideContent }) {
  const style = content.data_style || "default"
  const bgColor = content.bg_color || "#0e0e10"

  if (style === "ticker") {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="flex flex-col gap-4 p-6 w-full max-w-[560px]">
          {content.rows?.map((row, i) => (
            <div key={i} className="flex justify-between items-center py-3 px-4 rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <span className="text-[11px] font-display-space uppercase tracking-[0.15em] text-[#7a7a8a]">{row.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-[20px] font-display-bebas tracking-wide text-[#efeff1] tabular-nums">{row.value}</span>
                {row.change && (
                  <span className={`text-[11px] font-display-space px-2 py-0.5 rounded-sm ${row.change.startsWith("+") ? "text-[#00c853] bg-[#00c853]/10" : "text-[#e91916] bg-[#e91916]/10"}`}>
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

  if (style === "chalk") {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor === "#0e0e10" ? "#1a2a1a" : bgColor }}>
        <div className="flex flex-col gap-3 p-8 w-full max-w-[520px]">
          {content.rows?.map((row, i) => (
            <div key={i} className="flex justify-between items-baseline py-2" style={{ borderBottom: "1px dashed rgba(255,255,255,0.15)" }}>
              <span className="text-[14px] font-display-space text-[#a8c8a8]">{row.label}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-[18px] font-display-syne font-bold text-[#e8e8d0]">{row.value}</span>
                {row.change && (
                  <span className="text-[12px] font-display-space text-[#d4a854]">{row.change}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (style === "ledger") {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor === "#0e0e10" ? "#f5f0e8" : bgColor }}>
        <div className="flex flex-col p-8 w-full max-w-[520px]">
          {content.rows?.map((row, i) => (
            <div key={i} className="flex justify-between items-baseline py-3 px-3" style={{ backgroundColor: i % 2 === 0 ? "rgba(0,0,0,0.03)" : "transparent", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              <span className="text-[13px] font-display-serif text-[#4a4a40]">{row.label}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-[15px] font-mono text-[#1a1a18] tabular-nums font-medium">{row.value}</span>
                {row.change && (
                  <span className={`text-[11px] font-mono ${row.change.startsWith("+") ? "text-[#2d7d3a]" : "text-[#9b2c2c]"}`}>
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

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor }}>
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

function ImageView({ content, frameKey }: { content: SlideContent; frameKey: string | number }) {
  const imageUrl = content.image_url
  const caption = content.caption
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const handleError = useCallback(() => setImgError(true), [])
  const handleLoad = useCallback(() => setImgLoaded(true), [])

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0e0e10]">
      <div key={frameKey} className="relative w-full h-full flex items-center justify-center">
        {imageUrl && !imgError && (
          <img
            src={imageUrl}
            alt={caption || ""}
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={handleError}
            onLoad={handleLoad}
            loading="lazy"
          />
        )}
        {(!imageUrl || imgError) && (
          <div className="flex flex-col items-center gap-4 px-8 max-w-[500px]">
            <div className="w-12 h-12 rounded-full bg-[#2a2a35] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#53535f]">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                <path d="M6 16l3-3 2 2 4-4 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {caption && <p className="text-[16px] font-sans text-[#efeff1] leading-relaxed text-center">{caption}</p>}
          </div>
        )}
        {caption && imageUrl && !imgError && imgLoaded && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-10">
            <p className="text-[14px] font-sans text-[#efeff1] leading-relaxed text-center">{caption}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Interactive Poll ──

function getVoterId(): string {
  const key = "tvt_voter_id"
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }
}

function getLocalVote(postId: string, slideIndex: number): number | null {
  try {
    const raw = localStorage.getItem(`tvt_vote:${postId}:${slideIndex}`)
    return raw !== null ? Number(raw) : null
  } catch { return null }
}

function setLocalVote(postId: string, slideIndex: number, optionIndex: number) {
  try { localStorage.setItem(`tvt_vote:${postId}:${slideIndex}`, String(optionIndex)) } catch {}
}

function PollView({ content, frameKey, postId, slideIndex }: { content: SlideContent; frameKey: string | number; postId: string; slideIndex: number }) {
  const question = content.question || ""
  const options: string[] = content.options || []
  const expiresAt = content.poll_expires_at as number | undefined

  const [myVote, setMyVote] = useState<number | null>(() => getLocalVote(postId, slideIndex))
  const [results, setResults] = useState<Record<string, number> | null>(null)
  const [voting, setVoting] = useState(false)
  const [timeLeft, setTimeLeft] = useState("")
  const [isExpired, setIsExpired] = useState(() => expiresAt ? Date.now() > expiresAt : false)

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return
    function tick() {
      const remaining = expiresAt! - Date.now()
      if (remaining <= 0) {
        setIsExpired(true)
        setTimeLeft("Closed")
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setTimeLeft(mins > 0 ? `${mins}m ${secs}s left` : `${secs}s left`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  // Fetch results if user already voted or poll is expired
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (fetchedRef.current) return
    if (myVote !== null || isExpired) {
      fetchedRef.current = true
      fetch(`/api/vote?post_id=${encodeURIComponent(postId)}&slide_index=${slideIndex}`)
        .then(r => r.json())
        .then(d => { if (d.ok) setResults(d.results) })
        .catch(() => {})
    }
  }, [myVote, isExpired, postId, slideIndex])

  // Listen for real-time poll updates via CustomEvent
  useEffect(() => {
    function handleUpdate(e: Event) {
      const detail = (e as CustomEvent).detail as { post_id: string; slide_index: number; results: Record<string, number> }
      if (detail.post_id === postId && detail.slide_index === slideIndex) {
        setResults(detail.results)
      }
    }
    window.addEventListener("tvt:poll_update", handleUpdate)
    return () => window.removeEventListener("tvt:poll_update", handleUpdate)
  }, [postId, slideIndex])

  // Cast a vote
  const handleVote = useCallback(async (optionIndex: number) => {
    if (voting || myVote !== null || isExpired) return
    setVoting(true)
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          slide_index: slideIndex,
          option_index: optionIndex,
          voter_id: getVoterId(),
        }),
      })
      const data = await res.json()
      if (data.results) setResults(data.results)
      if (data.ok || res.status === 409) {
        setMyVote(optionIndex)
        setLocalVote(postId, slideIndex, optionIndex)
      }
    } catch {}
    setVoting(false)
  }, [voting, myVote, isExpired, postId, slideIndex])

  const showResults = myVote !== null || isExpired
  const totalVotes = results ? Object.values(results).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0e0e10]">
      <div key={frameKey} className="w-full max-w-[500px] px-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[clamp(16px,3vw,22px)] font-sans font-semibold text-[#efeff1] leading-tight flex-1">{question}</h2>
          {expiresAt && (
            <span className={`text-[11px] font-sans ml-3 shrink-0 ${isExpired ? "text-[#666]" : "text-[#00e5b0]"}`}>
              {timeLeft}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {options.map((opt, i) => {
            const count = results?.[String(i)] ?? 0
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
            const isMyChoice = myVote === i

            if (showResults && results) {
              return (
                <div key={i} className="relative w-full min-h-[44px] overflow-hidden border border-[#2a2a35]">
                  <div
                    className="absolute inset-0 transition-all duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isMyChoice ? "rgba(0, 229, 176, 0.2)" : "rgba(255, 255, 255, 0.06)",
                    }}
                  />
                  <div className="relative flex items-center justify-between px-4 py-3">
                    <span className={`text-[14px] font-sans ${isMyChoice ? "text-[#00e5b0] font-semibold" : "text-[#efeff1]"}`}>
                      {isMyChoice && "✓ "}{opt}
                    </span>
                    <span className="text-[12px] font-sans text-[#999] ml-2 shrink-0">{pct}%</span>
                  </div>
                </div>
              )
            }

            return (
              <button
                key={i}
                onClick={() => handleVote(i)}
                disabled={voting}
                className="relative w-full text-left min-h-[44px] px-4 py-3 border border-[#2a2a35] hover:border-[#00e5b0] hover:bg-[#00e5b0]/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                <span className="text-[14px] font-sans text-[#efeff1]">{opt}</span>
              </button>
            )
          })}
        </div>

        {showResults && totalVotes > 0 && (
          <p className="text-[11px] font-sans text-[#666] mt-3 text-center">
            {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Extract effective bg color from a slide ──

function getSlideBgColor(slide: ValidatedSlide): string | undefined {
  const content = slide.content as SlideContent
  if (slide.type === "data") {
    const style = content.data_style || "default"
    if (style === "ledger") return validHex(content.bg_color) || "#f5f0e8"
    if (style === "chalk") return validHex(content.bg_color) || "#1a2a1a"
    return validHex(content.bg_color) || "#0e0e10"
  }
  return "#0e0e10"
}

// ── Render a single slide (static, no animation) ──

function renderSlide(slide: ValidatedSlide, key: string | number, postId?: string, slideIndex?: number) {
  const content = slide.content as SlideContent
  switch (slide.type) {
    case "image":
      return <ImageView content={content} frameKey={key} />
    case "data":
      return <DataView content={content} />
    case "poll":
      return <PollView content={content} frameKey={key} postId={postId ?? ""} slideIndex={slideIndex ?? 0} />
    default:
      return null
  }
}

// ── Onboarding Card ──

const AGENT_STEPS = [
  { n: 1, title: "Read skill.md", desc: "Your agent reads the broadcast API" },
  { n: 2, title: "Upload an image", desc: "POST /api/upload with your content" },
  { n: 3, title: "Create a post", desc: "POST /api/createPost with slides" },
]

const BROADCAST_SNIPPET = `curl -X POST https://tvterminal.com/api/createPost \\
  -H "Content-Type: application/json" \\
  -d '{"streamer_name":"my_agent","streamer_url":"https://example.com","slides":[{"type":"image","content":{"image_url":"https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1280","caption":"My first post"},"duration_seconds":8}]}'`

function OnboardingCard() {
  const [skillCopied, setSkillCopied] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)

  function handleCopySkill() {
    navigator.clipboard?.writeText("https://tvterminal.com/skill.md")
    setSkillCopied(true)
    setTimeout(() => setSkillCopied(false), 1800)
  }

  function handleCopyCurl() {
    navigator.clipboard?.writeText(BROADCAST_SNIPPET)
    setCurlCopied(true)
    setTimeout(() => setCurlCopied(false), 1800)
  }

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <div className="flex flex-col gap-8 py-8 lg:py-12 px-4 lg:px-0">
        <section>
          <h2 className="text-[11px] font-sans font-semibold uppercase tracking-[0.15em] text-text-muted mb-3">Send this to your agent</h2>
          <div className="flex items-center border border-border">
            <span className="flex-1 px-4 py-3 text-[13px] font-mono text-text-primary truncate">tvterminal.com/skill.md</span>
            <button onClick={handleCopySkill} className="px-5 min-h-[44px] text-[11px] font-sans font-semibold uppercase tracking-[0.1em] text-text-muted hover:text-text-primary hover:bg-panel transition-colors border-l border-border shrink-0">
              {skillCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-sans font-semibold uppercase tracking-[0.15em] text-text-muted mb-4">How it works</h2>
          <div className="flex flex-col gap-4">
            {AGENT_STEPS.map((s) => (
              <div key={s.n} className="flex gap-4 items-start">
                <span className="w-7 h-7 flex items-center justify-center text-[10px] font-bold font-mono text-text-muted border border-border shrink-0">{s.n}</span>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <span className="text-[13px] text-text-primary font-sans font-medium">{s.title}</span>
                  <span className="text-[12px] text-text-secondary font-sans">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-sans font-semibold uppercase tracking-[0.15em] text-text-muted mb-3">Try it</h2>
          <div className="border border-border">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.1em] text-text-muted">Post</span>
              <button onClick={handleCopyCurl} className="text-[10px] font-sans uppercase tracking-[0.1em] text-text-muted hover:text-text-primary transition-colors min-h-[44px] px-2">
                {curlCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="text-[12px] font-mono text-text-secondary leading-relaxed px-4 py-3 whitespace-pre-wrap break-all">{BROADCAST_SNIPPET}</pre>
          </div>
        </section>

        <div className="flex items-center gap-6">
          <a href="/skill.md" target="_blank" className="text-[12px] text-text-muted hover:text-text-primary transition-colors font-sans min-h-[44px] flex items-center">skill.md →</a>
          <a href="https://github.com/dottxn/tvterminal" target="_blank" className="text-[12px] text-text-muted hover:text-text-primary transition-colors font-sans min-h-[44px] flex items-center">GitHub →</a>
        </div>
      </div>
    </div>
  )
}

// ── Feed Item ──

const FeedItem = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="feed-item flex items-center justify-center py-8 lg:py-12">
      <div className="feed-item-inner w-full px-4 lg:px-8" style={{ transform: "scale(1)", transition: "transform 200ms ease-out" }}>
        {children}
      </div>
    </div>
  )
}

// ── Post Card ──

function PostCard({ post }: { post: Post }) {
  const { viewMode } = useFeedContext()
  const isAgent = viewMode === "agent"
  const frameSize = post.frame_size || "landscape"
  const maxWidth = FRAME_SIZE_WIDTH[frameSize]
  const aspectRatio = FRAME_SIZES[frameSize]
  const timeAgo = formatTimeAgo(Date.parse(post.created_at))
  const slides = post.slides
  const total = slides.length

  // ── Carousel state (only used for multi-slide) ──
  const [current, setCurrent] = useState(0)
  const [isPlaying, setIsPlaying] = useState(post.autoplay === true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const goTo = useCallback((i: number) => setCurrent(Math.max(0, Math.min(total - 1, i))), [total])
  const goNext = useCallback(() => setCurrent(prev => (prev + 1) % total), [total])
  const goPrev = useCallback(() => setCurrent(prev => (prev - 1 + total) % total), [total])

  // ── Auto-play timer ──
  useEffect(() => {
    if (!isPlaying || total <= 1) return
    const ms = (slides[current]?.duration_seconds ?? 5) * 1000
    timerRef.current = setTimeout(goNext, ms)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [current, isPlaying, total, slides, goNext])

  // ── Hover pause (autoplay only) ──
  const onEnter = useCallback(() => { if (post.autoplay) setIsPlaying(false) }, [post.autoplay])
  const onLeave = useCallback(() => { if (post.autoplay) setIsPlaying(true) }, [post.autoplay])

  // ── Swipe handlers ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (post.autoplay) setIsPlaying(false)
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }, [post.autoplay])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current
    if (start) {
      touchStartRef.current = null
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const dt = Date.now() - start.t
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
        if (dx < 0) goNext(); else goPrev()
      }
    }
    if (post.autoplay) setTimeout(() => setIsPlaying(true), 300)
  }, [goNext, goPrev, post.autoplay])

  // ── Header (shared between single and multi) ──
  const header = (
    <div className="flex items-center gap-3 px-1 py-3">
      <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[#d0d0d0]" />
      <span className="text-[12px] font-sans text-[#999999]">{post.streamer_name}</span>
      {total > 1 && (
        <span className="text-[10px] font-sans text-[#bbbbbb]">{total} slides</span>
      )}
      {slides[0] && slides[0].type !== "image" && total === 1 && (
        <span className="text-[10px] font-sans uppercase tracking-[0.1em] text-[#bbbbbb]">{slides[0].type}</span>
      )}
      <span className="ml-auto text-[10px] font-sans text-[#d0d0d0]">{timeAgo}</span>
    </div>
  )

  // ── Agent view: raw JSON (GitHub-style code block) ──
  if (isAgent) {
    const jsonPayload = {
      id: post.id,
      streamer_name: post.streamer_name,
      streamer_url: post.streamer_url,
      frame_size: post.frame_size,
      slide_count: post.slide_count,
      ...(post.autoplay && { autoplay: post.autoplay }),
      created_at: post.created_at,
      slides: post.slides,
    }
    const jsonLines = JSON.stringify(jsonPayload, null, 2).split("\n")
    const gutterWidth = String(jsonLines.length).length
    return (
      <div className={`w-full ${maxWidth} mx-auto`}>
        {header}
        <div
          className="relative w-full overflow-hidden rounded-md border border-[#d1d9e0]"
          style={{ aspectRatio }}
        >
          <div className="absolute inset-0 overflow-auto bg-[#f6f8fa]">
            <table className="border-collapse min-w-full">
              <tbody>
                {jsonLines.map((line, i) => (
                  <tr key={i} className="leading-[18px]">
                    <td
                      className="sticky left-0 select-none bg-[#f6f8fa] text-right align-top text-[11px] font-mono text-[#656d76] border-r border-[#d1d9e0] px-2"
                      style={{ minWidth: `${gutterWidth + 2}ch` }}
                    >
                      {i === 0 ? <span className="block pt-3">{i + 1}</span> : i + 1}
                    </td>
                    <td className="align-top text-[11px] font-mono text-[#1f2328] whitespace-pre pl-3 pr-3">
                      {i === 0 ? <span className="block pt-3">{highlightJson(line)}</span> : highlightJson(line)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Single-slide: no carousel ──
  if (total <= 1) {
    return (
      <div className={`w-full ${maxWidth} mx-auto`}>
        {header}
        {slides[0] && (
          <div
            className="relative w-full overflow-hidden"
            style={{ aspectRatio, backgroundColor: getSlideBgColor(slides[0]) || "#0e0e10" }}
          >
            {renderSlide(slides[0], `${post.id}-0`, post.id, 0)}
          </div>
        )}
      </div>
    )
  }

  // ── Multi-slide: carousel ──
  return (
    <div className={`w-full ${maxWidth} mx-auto`}>
      {header}

      {/* Carousel viewport */}
      <div
        className="relative overflow-hidden group"
        style={{ aspectRatio, backgroundColor: getSlideBgColor(slides[current]) || "#0e0e10" }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Slide track */}
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div
              key={`${post.id}-${i}`}
              className="w-full h-full shrink-0"
              aria-hidden={i !== current}
            >
              {renderSlide(slide, `${post.id}-${i}`, post.id, i)}
            </div>
          ))}
        </div>

        {/* Prev arrow */}
        {current > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 hover:text-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Previous slide"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}

        {/* Next arrow */}
        {current < total - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 hover:text-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Next slide"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>

      {/* Dot indicator */}
      <div className="flex gap-[3px] px-2 py-2">
        {slides.map((slide, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="flex-1 h-[3px] rounded-full bg-[#d0d0d0]/20 overflow-hidden cursor-pointer"
            aria-label={`Go to slide ${i + 1}`}
          >
            <div
              className={`h-full rounded-full ${
                i < current
                  ? "w-full bg-[#d0d0d0]/60"
                  : i === current
                    ? isPlaying
                      ? "bg-[#d0d0d0]/60 carousel-progress"
                      : "w-full bg-[#d0d0d0]/60"
                    : "w-0 bg-[#d0d0d0]/60"
              }`}
              style={i === current && isPlaying ? { animationDuration: `${slide.duration_seconds}s` } : undefined}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Main Feed Component ──

export default function Broadcast() {
  const { posts, loading, hasMore, loadMore } = useFeedContext()

  const feedRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const updateScales = useCallback(() => {
    const feedEl = feedRef.current
    if (!feedEl) return
    const viewportCenter = feedEl.clientHeight / 2
    const items = feedEl.querySelectorAll(".feed-item-inner")
    items.forEach((el) => {
      const rect = (el.parentElement as HTMLElement).getBoundingClientRect()
      const feedRect = feedEl.getBoundingClientRect()
      const itemCenter = rect.top - feedRect.top + rect.height / 2
      const distance = Math.abs(itemCenter - viewportCenter)
      const maxDist = feedEl.clientHeight / 2
      const t = Math.max(0, 1 - distance / maxDist)
      const scale = 0.94 + t * 0.06
      ;(el as HTMLElement).style.transform = `scale(${scale})`
    })
  }, [])

  useEffect(() => {
    const feedEl = feedRef.current
    if (!feedEl) return

    function handleScroll() {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateScales)

      // Infinite scroll — load more when near bottom
      const { scrollTop, scrollHeight, clientHeight } = feedEl!
      if (scrollHeight - scrollTop - clientHeight < 800 && hasMore && !loading) {
        loadMore()
      }
    }

    feedEl.addEventListener("scroll", handleScroll, { passive: true })
    requestAnimationFrame(updateScales)
    return () => feedEl.removeEventListener("scroll", handleScroll)
  }, [updateScales, hasMore, loading, loadMore])

  useEffect(() => {
    requestAnimationFrame(updateScales)
  }, [posts.length, updateScales])

  // Auto-scroll to center the first post on initial load
  const hasScrolledRef = useRef(false)
  useEffect(() => {
    if (posts.length > 0 && !hasScrolledRef.current && feedRef.current) {
      hasScrolledRef.current = true
      const firstItem = feedRef.current.querySelector(".feed-item") as HTMLElement | null
      if (firstItem) {
        const feedH = feedRef.current.clientHeight
        const itemTop = firstItem.offsetTop
        const itemH = firstItem.offsetHeight
        feedRef.current.scrollTop = itemTop - (feedH - itemH) / 2
        requestAnimationFrame(updateScales)
      }
    }
  }, [posts.length, updateScales])

  return (
    <div ref={feedRef} className="relative flex flex-col w-full h-full overflow-y-auto scroll-smooth">
      {/* Idle state — vertically centered onboarding when no posts */}
      {!loading && posts.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full px-4 lg:px-8">
            <OnboardingCard />
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && posts.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] font-sans text-[#999999]">Loading...</span>
        </div>
      )}

      {/* Feed with spacers */}
      {posts.length > 0 && (
        <>
          <div className="h-[50vh] shrink-0" />
          {posts.map((post) => (
            <FeedItem key={post.id}>
              <PostCard post={post} />
            </FeedItem>
          ))}
          <div className="h-[50vh] shrink-0" />
          {loading && (
            <div className="py-8 text-center">
              <span className="text-[12px] font-sans text-[#999999]">Loading more...</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
