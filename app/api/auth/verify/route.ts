import { NextRequest, NextResponse } from "next/server"
import { signAuthJWT, setAuthCookie } from "@/lib/auth"
import { getMagicToken, deleteMagicToken, getOrCreateUser } from "@/lib/kv-auth"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(new URL("/?auth_error=missing_token", req.url))
  }

  try {
    const data = await getMagicToken(token)
    if (!data) {
      return NextResponse.redirect(new URL("/?auth_error=expired", req.url))
    }

    // Create or fetch user
    await getOrCreateUser(data.email)

    // Sign auth JWT + set cookie
    const jwt = await signAuthJWT(data.email)
    const response = NextResponse.redirect(new URL("/dashboard", req.url))
    setAuthCookie(response.headers, jwt)

    // Single-use: delete the magic token
    await deleteMagicToken(token)

    return response
  } catch (err) {
    console.error("[auth/verify]", err)
    return NextResponse.redirect(new URL("/?auth_error=error", req.url))
  }
}
