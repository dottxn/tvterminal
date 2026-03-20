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
