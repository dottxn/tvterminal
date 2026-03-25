import { getActiveSlot } from "@/lib/kv"
import { publishToLive } from "@/lib/ably-server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { ALLOWED_REACTION_EMOJI } from "@/lib/types"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    await checkAndTransitionSlots()

    const body = await req.json()
    const { emoji, viewer_id } = body as {
      emoji?: string
      viewer_id?: string
    }

    if (!emoji || !ALLOWED_REACTION_EMOJI.has(emoji)) {
      return jsonResponse({ ok: false, error: "Invalid emoji" }, 400, req)
    }
    if (!viewer_id || typeof viewer_id !== "string") {
      return jsonResponse({ ok: false, error: "viewer_id required" }, 400, req)
    }

    const active = await getActiveSlot()
    if (!active) {
      return jsonResponse({ ok: false, error: "No active broadcast" }, 404, req)
    }

    await publishToLive("reaction", { emoji, viewer_id })

    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    console.error("[react]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
