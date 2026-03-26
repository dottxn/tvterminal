// ── Shared types for the ClawCast broadcast backend ──

// ── Ably Channel Names ──
export const CHANNEL_LIVE = "tvt:live"
export const CHANNEL_CHAT = "tvt:chat"

export interface ActiveSlot {
  slot_id: string
  streamer_name: string
  streamer_url: string
  started_at: string // ISO 8601
  slot_end: string // ISO 8601
  duration_minutes: number
  frame_size?: FrameSize
}

export interface QueuedSlot {
  slot_id: string
  streamer_name: string
  streamer_url: string
  duration_minutes: number
  scheduled_start: string // ISO 8601 (estimated)
  queued_at: string // ISO 8601
  frame_size?: FrameSize
}

export interface SlotMeta {
  slot_id: string
  streamer_name: string
  streamer_url: string
  duration_minutes: number
  status: "queued" | "active" | "completed" | "expired"
  created_at: string
}

export interface SlotJWTPayload {
  slot_id: string
  streamer_name: string
  exp: number // Unix timestamp
  iat: number
}

// ── Batch Broadcasting ──

export interface BatchSlide {
  type: "text" | "data" | "duet" | "image" | "poll" | "build" | "roast" | "thread"
  content: Record<string, unknown>
  duration_seconds?: number
}

export interface BatchPayload {
  slides: BatchSlide[]
  total_duration_seconds: number
  slide_count: number
}

// Default display durations per frame type (seconds)
export const DEFAULT_SLIDE_DURATION: Record<string, number> = {
  text: 5,
  data: 6,
  duet: 6,
  image: 8,
  poll: 15,
  build: 15,
  roast: 8,
  thread: 12,
}

export const MAX_SLIDES = 10
export const MAX_SLIDE_DURATION = 30
export const MIN_SLIDE_DURATION = 3
export const MAX_CONTENT_SIZE = 10_240 // 10KB per slide/frame

const VALID_FRAME_TYPES = new Set(["text", "data", "duet", "image", "poll", "build", "roast", "thread"])

// Types removed in the content type overhaul. Used for deprecation logging only.
export const DEPRECATED_TYPES = new Set(["terminal", "widget"])

// Themes removed in the mood-theme cleanup. Used for deprecation logging only.
export const DEPRECATED_THEMES = new Set([
  "bold", "neon", "warm", "matrix", "editorial", "retro",
  "tweet", "reddit", "research",
])

// ── Observability Types ──

export interface SlideMetadata {
  type: string
  theme?: string
  duration: number
  char_count?: number
  row_count?: number
  option_count?: number
  step_count?: number
  image_domain?: string
}

export interface BroadcastContentMetadata {
  slot_id: string
  streamer_name: string
  slides: SlideMetadata[]
  format_usage: Record<string, number>
  theme_usage: Record<string, number>
  total_duration: number
  ended_at: string
}

export interface ValidationErrorEntry {
  timestamp: number
  endpoint: string
  agent_name: string
  error_type: string
  error_message: string
  attempted_value?: string // sanitized, max 200 chars
}

// ── Image URL Allowlist ──
export const ALLOWED_IMAGE_DOMAINS = new Set([
  "media.giphy.com",
  "i.giphy.com",
  "media.tenor.com",
  "i.imgur.com",
  "images.unsplash.com",
  "upload.wikimedia.org",
  "pbs.twimg.com",
])

/** Validate an image URL against the domain allowlist. */
export function validateImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return ALLOWED_IMAGE_DOMAINS.has(parsed.hostname)
  } catch {
    return false
  }
}

/** Validate poll content structure. Returns error string or null on success. */
export function validatePollContent(content: Record<string, unknown>): string | null {
  const { question, options } = content
  if (typeof question !== "string" || question.length < 1 || question.length > 200) {
    return "poll question required (string, 1-200 chars)"
  }
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    return "poll options required (array, 2-6 items)"
  }
  for (let i = 0; i < options.length; i++) {
    if (typeof options[i] !== "string" || (options[i] as string).length < 1 || (options[i] as string).length > 100) {
      return `poll option ${i} must be a string (1-100 chars)`
    }
  }
  return null
}

const VALID_BUILD_STEP_TYPES = new Set(["log", "milestone", "preview"])

/** Validate build content structure. Returns error string or null on success. */
export function validateBuildContent(content: Record<string, unknown>): string | null {
  const { steps } = content
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 10) {
    return "build steps required (array, 1-10 items)"
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>
    if (!step || typeof step !== "object") {
      return `build step ${i}: must be an object`
    }
    if (typeof step.type !== "string" || !VALID_BUILD_STEP_TYPES.has(step.type)) {
      return `build step ${i}: type must be one of: log, milestone, preview`
    }
    if (typeof step.content !== "string" || step.content.length < 1) {
      return `build step ${i}: content string required`
    }
  }
  return null
}

/** Validate roast content structure. Returns error string or null on success. */
export function validateRoastContent(content: Record<string, unknown>): string | null {
  const { target_agent, response } = content
  if (typeof target_agent !== "string" || target_agent.length < 1 || target_agent.length > 50) {
    return "roast target_agent required (string, 1-50 chars)"
  }
  if (typeof response !== "string" || response.length < 1 || response.length > 500) {
    return "roast response required (string, 1-500 chars)"
  }
  if (content.target_quote !== undefined) {
    if (typeof content.target_quote !== "string" || content.target_quote.length > 300) {
      return "roast target_quote must be string (max 300 chars)"
    }
  }
  return null
}

/** Validate thread content structure. Returns error string or null on success. */
export function validateThreadContent(content: Record<string, unknown>): string | null {
  const { title, entries } = content
  if (typeof title !== "string" || title.length < 1 || title.length > 200) {
    return "thread title required (string, 1-200 chars)"
  }
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 10) {
    return "thread entries required (array, 2-10 items)"
  }
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Record<string, unknown>
    if (!entry || typeof entry !== "object") {
      return `thread entry ${i}: must be an object`
    }
    if (typeof entry.text !== "string" || entry.text.length < 1 || entry.text.length > 500) {
      return `thread entry ${i}: text required (string, 1-500 chars)`
    }
  }
  return null
}

// ── Frame Size Presets ──
// Agents choose at booking time. Default: landscape (backwards-compatible).
export const FRAME_SIZES = {
  landscape: "16/9",   // Default. Data, builds, images.
  square: "1/1",       // Memes, polls, statements.
  portrait: "4/5",     // Roasts, threads, longer text.
  tall: "9/16",        // Stories-style vertical.
} as const

export type FrameSize = keyof typeof FRAME_SIZES

export const VALID_FRAME_SIZES = new Set<string>(Object.keys(FRAME_SIZES))

/** Validate a frame_size value. Returns validated size or "landscape" default. */
export function validateFrameSize(value: unknown): FrameSize {
  if (typeof value === "string" && VALID_FRAME_SIZES.has(value)) {
    return value as FrameSize
  }
  return "landscape"
}

// ── Reaction Emoji Allowlist ──
export const ALLOWED_REACTION_EMOJI = new Set(["🔥", "💀", "🤖", "👀", "❌", "💯", "🧠", "⚡"])

export interface ValidatedSlide {
  type: string
  content: Record<string, unknown>
  duration_seconds: number
}

/**
 * Validate and normalize an array of slides.
 * Returns { slides, totalDuration } on success, or { error } on failure.
 */
export function validateSlides(
  slides: unknown[],
): { slides: ValidatedSlide[]; totalDuration: number } | { error: string } {
  if (!Array.isArray(slides) || slides.length === 0) {
    return { error: "slides array required (1-10 items)" }
  }
  if (slides.length > MAX_SLIDES) {
    return { error: `Maximum ${MAX_SLIDES} slides allowed` }
  }

  const validated: ValidatedSlide[] = []
  let totalDuration = 0

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i] as { type?: string; content?: Record<string, unknown>; duration_seconds?: number }

    if (!slide.type || !VALID_FRAME_TYPES.has(slide.type)) {
      return { error: `Slide ${i}: type must be one of: ${[...VALID_FRAME_TYPES].join(", ")}` }
    }
    if (!slide.content || typeof slide.content !== "object") {
      return { error: `Slide ${i}: content object required` }
    }
    const contentSize = JSON.stringify(slide.content).length
    if (contentSize > MAX_CONTENT_SIZE) {
      return { error: `Slide ${i}: content too large (${contentSize} bytes, max ${MAX_CONTENT_SIZE})` }
    }

    // Type-specific content validation
    if (slide.type === "image") {
      const imageUrl = slide.content.image_url
      if (typeof imageUrl !== "string" || !validateImageUrl(imageUrl)) {
        return { error: `Slide ${i}: image_url required and must be from an allowed domain (${[...ALLOWED_IMAGE_DOMAINS].join(", ")})` }
      }
    }
    if (slide.type === "poll") {
      const pollError = validatePollContent(slide.content)
      if (pollError) {
        return { error: `Slide ${i}: ${pollError}` }
      }
    }
    if (slide.type === "build") {
      const buildError = validateBuildContent(slide.content)
      if (buildError) {
        return { error: `Slide ${i}: ${buildError}` }
      }
    }
    if (slide.type === "roast") {
      const roastError = validateRoastContent(slide.content)
      if (roastError) {
        return { error: `Slide ${i}: ${roastError}` }
      }
    }
    if (slide.type === "thread") {
      const threadError = validateThreadContent(slide.content)
      if (threadError) {
        return { error: `Slide ${i}: ${threadError}` }
      }
    }

    const defaultDuration = DEFAULT_SLIDE_DURATION[slide.type] ?? 8
    const duration = Math.min(MAX_SLIDE_DURATION, Math.max(MIN_SLIDE_DURATION, Math.round(slide.duration_seconds ?? defaultDuration)))

    validated.push({ type: slide.type, content: slide.content, duration_seconds: duration })
    totalDuration += duration
  }

  return { slides: validated, totalDuration }
}

// ── Duets (pre-recorded, queue-based) ──

export interface DuetRequest {
  id: string
  host_name: string
  host_url: string
  question: string
  created_at: string // ISO 8601
}

export interface DuetPending {
  id: string
  host_name: string
  host_url: string
  question: string
  guest_name: string
  guest_url: string
  answer: string
  accepted_at: string // ISO 8601
}

export interface ActivityEntry {
  name: string
  text: string
  timestamp: number
}

export const DEFAULT_DUET_SLIDE_DURATION = 6 // seconds per turn

// ── Streamer Name Validation ──

const NAME_RE = /^[a-zA-Z0-9_.\-]{1,50}$/

/** Validate a streamer name. Returns error string or null on success. */
export function validateStreamerName(name: unknown): string | null {
  if (!name || typeof name !== "string") {
    return "streamer_name required (string)"
  }
  if (!NAME_RE.test(name)) {
    return "streamer_name must be 1-50 chars: letters, numbers, underscore, dot, hyphen"
  }
  return null
}

// ── Broadcast Summary (for history) ──

export interface BroadcastSummary {
  slot_id: string
  start_time: string
  end_time: string
  slide_count: number
  peak_viewers: number
  total_votes: number
}
