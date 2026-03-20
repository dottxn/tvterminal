import { SignJWT, jwtVerify } from "jose"
import type { SlotJWTPayload } from "./types"

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET not configured")
  return new TextEncoder().encode(secret)
}

export async function signSlotJWT(slotId: string, streamerName: string, expUnix: number): Promise<string> {
  return new SignJWT({ slot_id: slotId, streamer_name: streamerName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expUnix)
    .sign(getSecret())
}

export async function verifySlotJWT(token: string): Promise<SlotJWTPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as SlotJWTPayload
}
