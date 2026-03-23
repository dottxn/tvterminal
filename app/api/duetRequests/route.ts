import { listOpenDuetRequests } from "@/lib/kv"
import { optionsResponse, jsonResponse } from "@/lib/cors"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  try {
    const requests = await listOpenDuetRequests()
    return jsonResponse({ ok: true, requests }, 200, req)
  } catch (err) {
    console.error("[duetRequests]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
