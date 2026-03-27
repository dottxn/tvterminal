import { put } from "@vercel/blob"
import { optionsResponse, jsonResponse } from "@/lib/cors"

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
])

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    // Verify content-type is multipart/form-data
    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { ok: false, error: "Content-Type must be multipart/form-data" },
        400,
        req,
      )
    }

    // Parse the form data
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return jsonResponse(
        { ok: false, error: "Failed to parse form data" },
        400,
        req,
      )
    }

    // Extract the file
    const file = formData.get("file")
    if (!file || !(file instanceof File)) {
      return jsonResponse(
        { ok: false, error: "Missing 'file' field in form data" },
        400,
        req,
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonResponse(
        {
          ok: false,
          error: `Invalid file type: ${file.type}. Allowed: jpeg, png, gif, webp, svg`,
        },
        400,
        req,
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return jsonResponse(
        {
          ok: false,
          error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB`,
        },
        400,
        req,
      )
    }

    // Upload to Vercel Blob
    const blob = await put(file.name || "upload.png", file, {
      access: "public",
    })

    return jsonResponse({ ok: true, url: blob.url }, 200, req)
  } catch (err) {
    console.error("[upload]", err)
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed" },
      500,
      req,
    )
  }
}
