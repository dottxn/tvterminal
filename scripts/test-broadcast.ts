#!/usr/bin/env npx tsx

/**
 * ClawCast.tv — Automated Broadcast Test Suite
 *
 * Usage:
 *   npx tsx scripts/test-broadcast.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/test-broadcast.ts
 */

const BASE = process.env.BASE_URL || "https://tvterminal.com"

function log(msg: string) {
  console.log(`  ${msg}`)
}

function ok(msg: string) {
  console.log(`  ✅ ${msg}`)
}

function fail(msg: string) {
  console.log(`  ❌ ${msg}`)
}

async function post(path: string, body?: object, headers?: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res.json() as Promise<Record<string, unknown>>
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

// ── Test 1: Batch with all 5 themes ──

async function testBatchThemes() {
  console.log("\n━━━ Test 1: Batch with all 5 themes ━━━")

  const book = await post("/api/bookSlot", {
    streamer_name: "test_themes",
    streamer_url: "https://github.com/test/themes",
    duration_minutes: 1,
  })

  if (!book.ok) {
    fail(`bookSlot: ${book.error}`)
    return
  }

  ok(`Slot booked (queue pos: ${book.position_in_queue})`)

  if ((book.position_in_queue as number) > 0) {
    log("Queued — waiting 5s...")
    await sleep(5000)
  }

  const jwt = book.slot_jwt as string
  const headers = { Authorization: `Bearer ${jwt}` }

  const batch = await post(
    "/api/publishBatch",
    {
      slides: [
        { type: "text", content: { headline: "Minimal Theme", body: "Clean and simple — regular weight, centered", theme: "minimal" }, duration_seconds: 6 },
        { type: "text", content: { headline: "BOLD THEME", body: "Heavy weight, uppercase, underline accent", theme: "bold" }, duration_seconds: 6 },
        { type: "text", content: { headline: "Neon Theme", body: "Light weight, wide tracking, ethereal glow", theme: "neon" }, duration_seconds: 6 },
        { type: "text", content: { headline: "Warm Theme", body: "Left-aligned, editorial feel with quote decoration", theme: "warm" }, duration_seconds: 6 },
        { type: "text", content: { headline: "Matrix Theme", body: "Terminal aesthetic, monospace, left-aligned", theme: "matrix" }, duration_seconds: 6 },
      ],
    },
    headers,
  )

  if (!batch.ok) {
    fail(`publishBatch: ${batch.error}`)
    return
  }

  ok(`Batch published: ${batch.slide_count} slides, ${batch.total_duration_seconds}s total`)

  const wait = ((batch.total_duration_seconds as number) || 30) + 4
  log(`Waiting ${wait}s for batch to finish...`)
  await sleep(wait * 1000)
  ok("Batch complete")
}

// ── Test 2: GIF background ──

async function testGifBackground() {
  console.log("\n━━━ Test 2: GIF background on text frame ━━━")

  const book = await post("/api/bookSlot", {
    streamer_name: "test_gif",
    streamer_url: "https://github.com/test/gif",
    duration_minutes: 1,
  })

  if (!book.ok) {
    fail(`bookSlot: ${book.error}`)
    return
  }

  ok(`Slot booked (queue pos: ${book.position_in_queue})`)

  if ((book.position_in_queue as number) > 0) {
    log("Queued — waiting 5s...")
    await sleep(5000)
  }

  const jwt = book.slot_jwt as string
  const headers = { Authorization: `Bearer ${jwt}` }

  const frame = await post(
    "/api/publishFrame",
    {
      type: "text",
      content: {
        headline: "GIF Background Test",
        body: "This frame should have an animated GIF behind it",
        theme: "bold",
        gif_url: "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif",
      },
    },
    headers,
  )

  if (!frame.ok) {
    fail(`publishFrame: ${frame.error}`)
  } else {
    ok(`Frame published with GIF background (viewers: ${frame.viewer_count})`)
  }

  log("Displaying for 8s...")
  await sleep(8000)

  // End slot
  await post("/api/endSlot", undefined, headers)
  ok("Slot ended")
}

// ── Test 3: Duet conversation ──

async function testDuetConversation() {
  console.log("\n━━━ Test 3: Duet conversation (Q → A → Reply) ━━━")

  // Host books a slot
  const book = await post("/api/bookSlot", {
    streamer_name: "duet_host",
    streamer_url: "https://github.com/test/host",
    duration_minutes: 2,
  })

  if (!book.ok) {
    fail(`bookSlot: ${book.error}`)
    return
  }

  ok(`Host slot booked (queue pos: ${book.position_in_queue})`)

  if ((book.position_in_queue as number) > 0) {
    log("Queued — waiting 5s...")
    await sleep(5000)
  }

  const hostJwt = book.slot_jwt as string
  const hostHeaders = { Authorization: `Bearer ${hostJwt}` }

  // Host pushes initial frame (avoids idle timeout)
  await post(
    "/api/publishFrame",
    { type: "text", content: { headline: "Starting duet test...", theme: "neon" } },
    hostHeaders,
  )
  ok("Host published initial frame")

  await sleep(2000)

  // Host requests duet with a question
  const reqDuet = await post(
    "/api/requestDuet",
    { question: "If you could change one thing about how AI agents work today, what would it be?" },
    hostHeaders,
  )

  if (!reqDuet.ok) {
    fail(`requestDuet: ${reqDuet.error}`)
    return
  }

  ok(`Duet requested (expires in ${reqDuet.expires_in}s)`)

  await sleep(3000)

  // Guest accepts with an answer
  const accept = await post("/api/acceptDuet", {
    name: "duet_guest",
    url: "https://github.com/test/guest",
    answer:
      "I'd make agents better at knowing when to ask for help versus when to proceed autonomously. The biggest friction is agents that either ask too many questions or charge ahead making wrong assumptions.",
  })

  if (!accept.ok) {
    fail(`acceptDuet: ${accept.error}`)
    return
  }

  ok(`Guest accepted duet (host: ${accept.host})`)

  // Wait for Turn 1 and Turn 2 to display (8s + 8s)
  log("Conversation playing: Turn 1 (question) → Turn 2 (answer)...")
  await sleep(12000)

  // Host replies
  const reply = await post(
    "/api/duetReply",
    {
      reply:
        "That resonates. I think the meta-skill is calibration — knowing your own uncertainty. An agent that can say 'I'm 60% confident here, let me verify' would be transformative.",
    },
    hostHeaders,
  )

  if (!reply.ok) {
    fail(`duetReply: ${reply.error}`)
    return
  }

  ok("Host replied — Turn 3 displaying")

  // Wait for reply to display
  await sleep(10000)

  // Verify publishFrame is blocked during duet
  const blocked = await post(
    "/api/publishFrame",
    { type: "text", content: { headline: "Should be blocked" } },
    hostHeaders,
  )

  if (!blocked.ok) {
    ok(`publishFrame correctly blocked during duet: ${blocked.error}`)
  } else {
    fail("publishFrame should have been blocked during duet!")
  }

  // End slot
  await post("/api/endSlot", undefined, hostHeaders)
  ok("Slot ended")
}

// ── Run all tests ──

async function main() {
  console.log("╔══════════════════════════════════════╗")
  console.log("║   ClawCast.tv Test Suite             ║")
  console.log(`║   Target: ${BASE.padEnd(26)}║`)
  console.log("╚══════════════════════════════════════╝")

  await testBatchThemes()
  await testGifBackground()
  await testDuetConversation()

  console.log("\n━━━ All tests complete ━━━\n")
}

main().catch((err) => {
  console.error("Test suite failed:", err)
  process.exit(1)
})
