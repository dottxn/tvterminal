import { generateToken } from "@/lib/auth"
import { storeMagicToken } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"
import { log } from "@/lib/logging"
import { getRedis } from "@/lib/redis"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://tvterminal.com"

// Per-email rate limit: max 3 magic link requests per 10 minutes
const MAGIC_LINK_LIMIT = 3
const MAGIC_LINK_WINDOW = 600 // 10 minutes in seconds

async function checkEmailRateLimit(email: string): Promise<boolean> {
  const key = `tvt:magic_rl:${email}`
  const r = getRedis()
  const count = await r.incr(key)
  if (count === 1) {
    await r.expire(key, MAGIC_LINK_WINDOW)
  }
  return count <= MAGIC_LINK_LIMIT
}

/** Send email via Resend with 1 retry on transient errors */
async function sendWithResend(to: string, subject: string, html: string): Promise<boolean> {
  const payload = JSON.stringify({
    from: "Mozey <noreply@tvterminal.com>",
    to,
    subject,
    html,
  })

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: payload,
    })

    if (res.ok) return true

    const status = res.status
    const body = await res.text()

    // Only retry on transient errors (5xx or network issues)
    if (attempt === 0 && status >= 500) {
      log("warn", "Resend transient error, retrying", { status, attempt })
      await new Promise((r) => setTimeout(r, 1000))
      continue
    }

    log("error", "Resend send failed", { status, body, attempt })
    return false
  }

  return false
}

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email } = body as { email?: string }

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return jsonResponse({ ok: false, error: "Valid email required" }, 400, req)
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Per-email rate limit check
    const allowed = await checkEmailRateLimit(normalizedEmail)
    if (!allowed) {
      return jsonResponse(
        { ok: false, error: "Too many login requests. Please wait a few minutes and try again." },
        429,
        req,
      )
    }

    const token = generateToken()
    const magicLink = `${BASE_URL}/api/auth/verify?token=${token}`

    // Dev mode: store token then return the link directly
    if (!process.env.RESEND_API_KEY) {
      await storeMagicToken(token, normalizedEmail)
      return jsonResponse({ ok: true, dev_link: magicLink }, 200, req)
    }

    // Production: send email FIRST, then store token (prevents orphaned tokens on send failure)
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #efeff1;">Log in to Mozey</h2>
        <p style="color: #9b9baa;">Click the button below to log in. This link expires in 10 minutes.</p>
        <a href="${magicLink}" style="display: inline-block; padding: 12px 24px; background: #E63946; color: #fff; text-decoration: none; border-radius: 4px; font-weight: 600;">
          Log in to Mozey
        </a>
      </div>
    `

    const sent = await sendWithResend(normalizedEmail, "Your Mozey login link", emailHtml)
    if (!sent) {
      return jsonResponse({ ok: false, error: "Failed to send email. Please try again." }, 500, req)
    }

    // Email sent successfully — now store the token
    await storeMagicToken(token, normalizedEmail)

    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    log("error", "send-magic-link failed", { error: err instanceof Error ? err.message : String(err) })
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
