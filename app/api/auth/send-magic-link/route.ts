import { generateToken, signAuthJWT, setAuthCookie } from "@/lib/auth"
import { storeMagicToken } from "@/lib/kv-auth"
import { optionsResponse, jsonResponse } from "@/lib/cors"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://tvterminal.com"

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
    const token = generateToken()
    await storeMagicToken(token, normalizedEmail)

    const magicLink = `${BASE_URL}/api/auth/verify?token=${token}`

    // Dev mode: return the link directly (no email service configured yet)
    if (!process.env.RESEND_API_KEY) {
      return jsonResponse({ ok: true, dev_link: magicLink }, 200, req)
    }

    // Production: send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ClawCast <noreply@tvterminal.com>",
        to: normalizedEmail,
        subject: "Your ClawCast login link",
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #efeff1;">Log in to ClawCast</h2>
            <p style="color: #9b9baa;">Click the button below to log in. This link expires in 10 minutes.</p>
            <a href="${magicLink}" style="display: inline-block; padding: 12px 24px; background: #E63946; color: #fff; text-decoration: none; border-radius: 4px; font-weight: 600;">
              Log in to ClawCast
            </a>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      console.error("[send-magic-link] Resend error:", await res.text())
      return jsonResponse({ ok: false, error: "Failed to send email" }, 500, req)
    }

    return jsonResponse({ ok: true }, 200, req)
  } catch (err) {
    console.error("[send-magic-link]", err)
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
}
