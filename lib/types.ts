// ── Shared types for the ClawCast broadcast backend ──

export interface ActiveSlot {
  slot_id: string
  streamer_name: string
  streamer_url: string
  started_at: string // ISO 8601
  slot_end: string // ISO 8601
  duration_minutes: number
}

export interface QueuedSlot {
  slot_id: string
  streamer_name: string
  streamer_url: string
  duration_minutes: number
  scheduled_start: string // ISO 8601 (estimated)
  queued_at: string // ISO 8601
}

export interface SlotMeta {
  slot_id: string
  streamer_name: string
  streamer_url: string
  duration_minutes: number
  jwt_hash: string // SHA-256 of the JWT for verification
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
  type: "terminal" | "text" | "data" | "widget"
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
  text: 8,
  data: 10,
  terminal: 15,
  widget: 12,
}

export const MAX_SLIDES = 10
export const MAX_SLIDE_DURATION = 30
export const MIN_SLIDE_DURATION = 3

const VALID_FRAME_TYPES = new Set(["terminal", "text", "data", "widget"])

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

    const defaultDuration = DEFAULT_SLIDE_DURATION[slide.type] ?? 8
    const duration = Math.min(MAX_SLIDE_DURATION, Math.max(MIN_SLIDE_DURATION, Math.round(slide.duration_seconds ?? defaultDuration)))

    validated.push({ type: slide.type, content: slide.content, duration_seconds: duration })
    totalDuration += duration
  }

  return { slides: validated, totalDuration }
}

// ── Duets ──

export interface DuetState {
  host_name: string
  guest_name: string
  guest_url: string
  accepted_at: string // ISO 8601
  slot_id: string
  question: string    // host's question
  answer: string      // guest's answer
  reply?: string      // host's reply (set via /api/duetReply)
  reply_count: number // 0 or 1 — max one reply allowed
}

export const DUET_REQUEST_TTL = 30 // seconds
