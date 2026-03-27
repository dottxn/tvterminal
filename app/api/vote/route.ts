import { getPost, recordPollVote, getPollResults } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

// GET /api/vote?post_id=xxx&slide_index=0 — fetch current results
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const postId = url.searchParams.get("post_id")
    const slideIndexStr = url.searchParams.get("slide_index")

    if (!postId || slideIndexStr === null) {
      return jsonResponse({ ok: false, error: "post_id and slide_index required" }, 400, req)
    }

    const slideIndex = parseInt(slideIndexStr, 10)
    if (isNaN(slideIndex) || slideIndex < 0) {
      return jsonResponse({ ok: false, error: "slide_index must be a non-negative integer" }, 400, req)
    }

    const results = await getPollResults(postId, slideIndex)
    return jsonResponse({ ok: true, results }, 200, req)
  } catch (err) {
    console.error("[vote GET]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}

// POST /api/vote — cast a vote
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { post_id, slide_index, option_index, voter_id } = body as {
      post_id?: string
      slide_index?: number
      option_index?: number
      voter_id?: string
    }

    // Validate inputs
    if (!post_id || typeof post_id !== "string") {
      return jsonResponse({ ok: false, error: "post_id required" }, 400, req)
    }
    if (typeof slide_index !== "number" || slide_index < 0) {
      return jsonResponse({ ok: false, error: "slide_index required (number >= 0)" }, 400, req)
    }
    if (typeof option_index !== "number" || option_index < 0) {
      return jsonResponse({ ok: false, error: "option_index required (number >= 0)" }, 400, req)
    }
    if (!voter_id || typeof voter_id !== "string" || voter_id.length > 64) {
      return jsonResponse({ ok: false, error: "voter_id required (string, max 64 chars)" }, 400, req)
    }

    // Load post and verify slide is a poll
    const post = await getPost(post_id)
    if (!post) {
      return jsonResponse({ ok: false, error: "Post not found" }, 404, req)
    }
    if (slide_index >= post.slides.length) {
      return jsonResponse({ ok: false, error: "Invalid slide_index" }, 400, req)
    }
    const slide = post.slides[slide_index]
    if (slide.type !== "poll") {
      return jsonResponse({ ok: false, error: "Slide is not a poll" }, 400, req)
    }

    // Check expiry
    const expiresAt = slide.content.poll_expires_at as number | undefined
    if (expiresAt && Date.now() > expiresAt) {
      const results = await getPollResults(post_id, slide_index)
      return jsonResponse({ ok: false, error: "Poll has closed", results }, 410, req)
    }

    // Check option bounds
    const options = slide.content.options as string[]
    if (option_index >= options.length) {
      return jsonResponse({ ok: false, error: "Invalid option_index" }, 400, req)
    }

    // Record vote
    const { success, results } = await recordPollVote(post_id, slide_index, option_index, voter_id)

    if (!success) {
      return jsonResponse({ ok: false, error: "Already voted", results }, 409, req)
    }

    // Broadcast update via Ably
    try {
      await publishToLive("poll_update", { post_id, slide_index, results })
    } catch (err) {
      console.error("[vote] Failed to publish poll_update:", err)
    }

    return jsonResponse({ ok: true, results }, 200, req)
  } catch (err) {
    console.error("[vote POST]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
