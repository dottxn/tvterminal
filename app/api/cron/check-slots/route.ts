import { NextResponse } from "next/server"
import { checkAndTransitionSlots } from "@/lib/slot-lifecycle"

export async function GET(req: Request) {
  // Verify Vercel cron auth
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    await checkAndTransitionSlots()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[cron/check-slots]", err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    )
  }
}
