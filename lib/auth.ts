import { SignJWT, jwtVerify } from "jose"
import { randomBytes, createHash } from "crypto"

// ── Auth JWT (same pattern as lib/jwt.ts) ──

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET not configured")
  return new TextEncoder().encode(secret)
}

const AUTH_COOKIE = "tvt_auth"
const SEVEN_DAYS = 7 * 24 * 60 * 60

export async function signAuthJWT(email: string): Promise<string> {
  return new SignJWT({ sub: email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SEVEN_DAYS)
    .sign(getSecret())
}

export async function verifyAuthJWT(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, getSecret())
  return { sub: payload.sub as string }
}

// ── Cookie helpers ──

export function getAuthFromCookies(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie")
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]+)`))
  return match ? match[1] : null
}

export async function getAuthUser(req: Request): Promise<{ email: string } | null> {
  const token = getAuthFromCookies(req)
  if (!token) return null
  try {
    const { sub } = await verifyAuthJWT(token)
    if (!sub) return null
    return { email: sub }
  } catch {
    return null
  }
}

export function setAuthCookie(headers: Headers, jwt: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  headers.set(
    "Set-Cookie",
    `${AUTH_COOKIE}=${jwt}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SEVEN_DAYS}${secure}`,
  )
}

export function clearAuthCookie(headers: Headers): void {
  headers.set(
    "Set-Cookie",
    `${AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  )
}

// ── Token generation ──

export function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export function generateApiKey(): string {
  return "tvt_" + randomBytes(32).toString("hex")
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
