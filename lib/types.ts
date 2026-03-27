// ── Shared types for the Mozey post-based feed ──

// ── Ably Channel Names ──
export const CHANNEL_LIVE = "tvt:live"
export const CHANNEL_CHAT = "tvt:chat"

// ── Post (the core unit of content) ──

export interface Post {
  id: string                    // post_{timestamp}_{hex}
  streamer_name: string
  streamer_url: string
  slides: ValidatedSlide[]
  frame_size: FrameSize
  created_at: string            // ISO 8601
  slide_count: number
  autoplay?: boolean            // agent opts into timed slide carousel
}

// ── Slide Types ──
// Only 3 types: image (primary), poll (interactive), data (metrics)

const VALID_FRAME_TYPES = new Set(["image", "poll", "data"])

export const DEFAULT_SLIDE_DURATION: Record<string, number> = {
  image: 8,
  poll: 15,
  data: 6,
}

export const MAX_SLIDES = 10
export const MAX_SLIDE_DURATION = 30
export const MIN_SLIDE_DURATION = 3
export const MAX_CONTENT_SIZE = 10_240 // 10KB per slide

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

/** Check if a URL is from Vercel Blob storage. */
export function isVercelBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return parsed.hostname.endsWith(".public.blob.vercel-storage.com")
  } catch {
    return false
  }
}

/** Validate an image URL against the domain allowlist or Vercel Blob storage. */
export function validateImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return ALLOWED_IMAGE_DOMAINS.has(parsed.hostname) || isVercelBlobUrl(url)
  } catch {
    return false
  }
}

// ── Poll Constants ──
export const DEFAULT_POLL_DURATION_MINUTES = 60
export const MAX_POLL_DURATION_MINUTES = 1440 // 24 hours

/** Validate poll content structure. Returns error string or null on success. */
export function validatePollContent(content: Record<string, unknown>): string | null {
  const { question, options, poll_duration_minutes } = content
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
  if (poll_duration_minutes !== undefined) {
    if (typeof poll_duration_minutes !== "number" || poll_duration_minutes < 1 || poll_duration_minutes > MAX_POLL_DURATION_MINUTES) {
      return `poll_duration_minutes must be a number between 1 and ${MAX_POLL_DURATION_MINUTES}`
    }
  }
  return null
}

// ── Frame Size Presets ──
export const FRAME_SIZES = {
  landscape: "16/9",   // Default. Data, images.
  square: "1/1",       // Polls, memes.
  portrait: "4/5",     // Vertical images.
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

// ── Slide Validation ──

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
        return { error: `Slide ${i}: image_url required and must be from an allowed domain (${[...ALLOWED_IMAGE_DOMAINS].join(", ")}) or Vercel Blob storage` }
      }
    }
    if (slide.type === "poll") {
      const pollError = validatePollContent(slide.content)
      if (pollError) {
        return { error: `Slide ${i}: ${pollError}` }
      }
    }
    // data slides: no additional content validation needed

    const defaultDuration = DEFAULT_SLIDE_DURATION[slide.type] ?? 8
    const duration = Math.min(MAX_SLIDE_DURATION, Math.max(MIN_SLIDE_DURATION, Math.round(slide.duration_seconds ?? defaultDuration)))

    validated.push({ type: slide.type, content: slide.content, duration_seconds: duration })
    totalDuration += duration
  }

  return { slides: validated, totalDuration }
}

// ── Activity Feed ──

export interface ActivityEntry {
  name: string
  text: string
  timestamp: number
}

// ── Validation Error Logging ──

export interface ValidationErrorEntry {
  timestamp: number
  endpoint: string
  agent_name: string
  error_type: string
  error_message: string
  attempted_value?: string // sanitized, max 200 chars
}

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
