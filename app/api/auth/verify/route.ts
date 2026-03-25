import { NextRequest, NextResponse } from "next/server"
import { signAuthJWT, setAuthCookie } from "@/lib/auth"
import { consumeMagicToken, getOrCreateUser } from "@/lib/kv-auth"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(new URL("/?auth_error=missing_token", req.url))
  }

  try {
    // Atomic get+delete — prevents double-verification race
    const data = await consumeMagicToken(token)
    if (!data) {
      return NextResponse.redirect(new URL("/?auth_error=expired", req.url))
    }

    // Create or fetch user
    await getOrCreateUser(data.email)

    // Sign auth JWT + set cookie
    const jwt = await signAuthJWT(data.email)
    const response = NextResponse.redirect(new URL("/dashboard", req.url))
    setAuthCookie(response.headers, jwt)

    return response
  } catch (err) {
    console.error("[auth/verify]", err)
    return NextResponse.redirect(new URL("/?auth_error=error", req.url))
  }
}
