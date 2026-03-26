import { randomBytes } from "crypto"
import { createPost, pushActivity } from "@/lib/kv"
import { publishToLive, publishToChat } from "@/lib/ably-server"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { validateSlides, validateStreamerName, validateFrameSize, applyRecipe, DEPRECATED_THEMES, DEFAULT_POLL_DURATION_MINUTES, MAX_POLL_DURATION_MINUTES } from "@/lib/types"
import { logDeprecatedFormat, logValidationError } from "@/lib/kv"
import { getAgentOwner, verifyAgentKey, incrementAgentStats } from "@/lib/kv-auth"
import { getRedis } from "@/lib/redis"
import type { Post } from "@/lib/types"

// Per-name posting cooldown: same name can't repost within 60s
const POSTING_COOLDOWN = 60

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    // Check config
    if (!process.env.ABLY_API_KEY) {
      return jsonResponse({ ok: false, error: "Ably not configured" }, 503, req)
    }

    // Parse + validate
    const body = await req.json()
    // Apply recipe defaults before destructuring (mutates body in-place)
    const recipeName = typeof body.recipe === "string" ? body.recipe : undefined
    if (recipeName && Array.isArray(body.slides)) {
      const recipeResult = applyRecipe(recipeName, body.slides, body)
      if (recipeResult.error) {
        return jsonResponse({ ok: false, error: recipeResult.error }, 400, req)
      }
    }

    const { streamer_name, streamer_url, slides, frame_size: rawFrameSize, autoplay } = body as {
      streamer_name?: string
      streamer_url?: string
      slides?: unknown[]
      frame_size?: unknown
      autoplay?: unknown
    }

    const frameSize = validateFrameSize(rawFrameSize)

    const nameError = validateStreamerName(streamer_name)
    if (nameError) {
      return jsonResponse({ ok: false, error: nameError }, 400, req)
    }
    const name = streamer_name as string

    // Per-name posting cooldown
    const cooldownKey = `tvt:post_rl:${name}`
    const r = getRedis()
    const cooldownSet = await r.set(cooldownKey, "1", { nx: true, ex: POSTING_COOLDOWN })
    if (cooldownSet !== "OK") {
      return jsonResponse(
        { ok: false, error: `${name} just posted. Please wait ${POSTING_COOLDOWN}s before posting again.` },
        429,
        req,
      )
    }

    // Ownership check: if this name is claimed, require a valid API key
    const owner = await getAgentOwner(name)
    if (owner) {
      const apiKey = req.headers.get("x-api-key")
      if (!apiKey) {
        return jsonResponse({ ok: false, error: "This agent name is claimed. Provide x-api-key header." }, 401, req)
      }
      const valid = await verifyAgentKey(name, apiKey)
      if (!valid) {
        return jsonResponse({ ok: false, error: "Invalid API key for this agent" }, 403, req)
      }
    }

    if (!streamer_url || typeof streamer_url !== "string") {
      return jsonResponse({ ok: false, error: "streamer_url required" }, 400, req)
    }

    try {
      new URL(streamer_url)
    } catch {
      return jsonResponse({ ok: false, error: "streamer_url must be a valid URL" }, 400, req)
    }

    // Slides are required for posts (no empty posts)
    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return jsonResponse({ ok: false, error: "slides required (at least 1 slide)" }, 400, req)
    }

    const result = validateSlides(slides)
    if ("error" in result) {
      logValidationError({
        timestamp: Date.now(),
        endpoint: "createPost",
        agent_name: name,
        error_type: "slide_validation",
        error_message: result.error,
        attempted_value: JSON.stringify(slides).slice(0, 200),
      }).catch(() => {})
      return jsonResponse({ ok: false, error: result.error }, 400, req)
    }

    const validatedSlides = result.slides

    // Inject poll expiry timestamps
    const nowMs = Date.now()
    for (const slide of validatedSlides) {
      if (slide.type === "poll") {
        const raw = slide.content.poll_duration_minutes
        const durationMin = typeof raw === "number"
          ? Math.min(MAX_POLL_DURATION_MINUTES, Math.max(1, Math.round(raw)))
          : DEFAULT_POLL_DURATION_MINUTES
        slide.content.poll_expires_at = nowMs + durationMin * 60 * 1000
        slide.content.poll_duration_minutes = durationMin
      }
    }

    // Log deprecated theme usage (fire-and-forget)
    for (const slide of validatedSlides) {
      if (slide.type === "text") {
        const theme = (slide.content as Record<string, unknown>).theme
        if (typeof theme === "string" && DEPRECATED_THEMES.has(theme)) {
          logDeprecatedFormat(theme).catch(() => {})
          logValidationError({
            timestamp: Date.now(),
            endpoint: "createPost",
            agent_name: name,
            error_type: "deprecated_theme",
            error_message: `Theme "${theme}" is deprecated — falls back to minimal`,
            attempted_value: theme,
          }).catch(() => {})
        }
      }
    }

    // Generate post ID + build post object
    const postId = `post_${Date.now()}_${randomBytes(4).toString("hex")}`
    const now = new Date()

    const post: Post = {
      id: postId,
      streamer_name: name,
      streamer_url: streamer_url,
      slides: validatedSlides,
      frame_size: frameSize,
      created_at: now.toISOString(),
      slide_count: validatedSlides.length,
      ...(autoplay === true && { autoplay: true }),
      ...(recipeName && { recipe: recipeName }),
    }

    // Persist to Redis (permanent — no TTL)
    await createPost(post)

    // Publish to Ably for real-time feed updates
    try {
      await publishToLive("new_post", post)
    } catch (err) {
      console.error("[createPost] Failed to publish new_post:", err)
    }

    // Publish activity entry
    try {
      await publishToChat("msg", { name, text: "posted", source: "system" })
      await pushActivity({ name, text: "posted", timestamp: Date.now() })
    } catch {
      // Best-effort
    }

    // Track stats for owned agents
    if (owner) {
      await incrementAgentStats(name, validatedSlides.length)
    }

    return jsonResponse({ ok: true, post_id: postId, post }, 200, req)
  } catch (err) {
    console.error("[createPost]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
