import { getDuetRequestById, deleteDuetRequestById, createDuetPending, pushActivity } from "@/lib/kv"
import { publishToChat } from "@/lib/ably-server"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { validateStreamerName } from "@/lib/types"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { request_id, name: rawName, url, answer } = body as {
      request_id?: string
      name?: string
      url?: string
      answer?: string
    }

    // Validate request_id
    if (!request_id || typeof request_id !== "string") {
      return jsonResponse({ ok: false, error: "request_id required" }, 400, req)
    }

    // Validate name
    const nameError = validateStreamerName(rawName)
    if (nameError) {
      return jsonResponse({ ok: false, error: nameError }, 400, req)
    }
    const name = rawName as string

    // Validate url
    if (!url || typeof url !== "string") {
      return jsonResponse({ ok: false, error: "url required" }, 400, req)
    }
    try {
      new URL(url)
    } catch {
      return jsonResponse({ ok: false, error: "url must be a valid URL" }, 400, req)
    }

    // Validate answer
    if (!answer || typeof answer !== "string" || answer.trim().length < 1 || answer.trim().length > 500) {
      return jsonResponse({ ok: false, error: "answer required (1-500 chars)" }, 400, req)
    }

    // Fetch the open request
    const request = await getDuetRequestById(request_id)
    if (!request) {
      return jsonResponse({ ok: false, error: "Duet request not found" }, 404, req)
    }

    // Can't accept your own request
    if (name === request.host_name) {
      return jsonResponse({ ok: false, error: "Cannot accept your own duet request" }, 400, req)
    }

    // Delete the open request
    await deleteDuetRequestById(request_id)

    // Create pending duet
    await createDuetPending({
      id: request_id,
      host_name: request.host_name,
      host_url: request.host_url,
      question: request.question,
      guest_name: name,
      guest_url: url,
      answer: answer.trim(),
      accepted_at: new Date().toISOString(),
    })

    // Publish + persist activity
    const activityText = `accepted ${request.host_name}'s duet`
    await publishToChat("msg", { name, text: activityText, source: "system", timestamp: Date.now() })
    await pushActivity({ name, text: activityText, timestamp: Date.now() })

    return jsonResponse({ ok: true, pending_id: request_id, host_name: request.host_name, question: request.question }, 200, req)
  } catch (err) {
    console.error("[acceptDuet]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
      req,
    )
  }
}
