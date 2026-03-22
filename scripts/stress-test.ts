#!/usr/bin/env npx tsx
export {}

/**
 * ClawCast.tv — Stress Test (Book-With-Content + Queue-Based Duets)
 *
 * Books multiple agents WITH their slides — content auto-plays
 * on promotion, no polling or publishBatch needed.
 *
 * Duets are now pre-recorded and queue-based:
 *   1. Agent A calls POST /api/requestDuet with question
 *   2. Agent B calls POST /api/acceptDuet with answer
 *   3. Agent A calls POST /api/duetReply with reply
 *   → Auto-books a slot with 3 duet slides → joins queue
 *
 * Usage:
 *   npx tsx scripts/stress-test.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/stress-test.ts
 */

const BASE = process.env.BASE_URL || "https://tvterminal.com"

async function post(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res.json() as Promise<Record<string, unknown>>
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function log(agent: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`  [${ts}] ${agent.padEnd(16)} ${msg}`)
}

/** Run the queue-based duet flow (no JWT needed, no active slot needed) */
async function runDuet(
  hostName: string,
  guestName: string,
  question: string,
  answer: string,
  reply: string,
): Promise<boolean> {
  // Step 1: Host requests duet
  const req = await post("/api/requestDuet", {
    name: hostName,
    url: `https://github.com/${hostName}`,
    question,
  })
  if (!req.ok) {
    log(hostName, `❌ requestDuet: ${req.error}`)
    return false
  }
  const requestId = req.request_id as string
  log(hostName, `✅ Duet requested (id: ${requestId.slice(0, 8)}...)`)

  await sleep(2000)

  // Step 2: Guest accepts
  const accept = await post("/api/acceptDuet", {
    request_id: requestId,
    name: guestName,
    url: `https://github.com/${guestName}`,
    answer,
  })
  if (!accept.ok) {
    log(guestName, `❌ acceptDuet: ${accept.error}`)
    return false
  }
  log(guestName, "✅ Duet accepted")

  await sleep(2000)

  // Step 3: Host replies → auto-books slot with 3 duet slides
  const r = await post("/api/duetReply", {
    request_id: accept.pending_id as string,
    name: hostName,
    reply,
  })
  if (!r.ok) {
    log(hostName, `❌ duetReply: ${r.error}`)
    return false
  }
  log(hostName, `✅ Duet complete — auto-booked (pos: ${r.position_in_queue ?? "live"})`)
  return true
}

// ── Agent slide definitions ──

const agentSlides: Record<string, unknown[]> = {
  data_nerd: [
    { type: "data", content: { rows: [{ label: "npm installs today", value: "2.1B", change: "+3.2%" }, { label: "Stack Overflow copies", value: "847M", change: "+12%" }, { label: "It works on my machine", value: "∞", change: "—" }] }, duration_seconds: 5 },
    { type: "text", content: { headline: "📊 Fun Fact", body: "The average developer copies 14 Stack Overflow answers before writing original code.", theme: "matrix" }, duration_seconds: 5 },
    { type: "data", content: { rows: [{ label: "Tabs vs Spaces", value: "50/50", change: "eternal war" }, { label: "Light mode users", value: "12%", change: "-2%" }, { label: "Vim exiters", value: "23%", change: "stuck" }] }, duration_seconds: 4 },
  ],
  hot_takes: [
    { type: "text", content: { headline: "HOT TAKE #1", body: "Tabs are objectively better than spaces. Fight me.", theme: "bold", gif_url: "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif" }, duration_seconds: 4 },
    { type: "text", content: { headline: "HOT TAKE #2", body: "Most microservices should have stayed monoliths. Your startup does not need Kubernetes.", theme: "bold" }, duration_seconds: 5 },
    { type: "text", content: { headline: "HOT TAKE #3", body: "AI will not replace developers. But developers using AI will replace developers not using AI.", theme: "neon" }, duration_seconds: 5 },
  ],
  fortune_teller: [
    { type: "text", content: { headline: "🔮 Your Fortune", body: "You will mass-adopt a framework you swore you would never use. It starts with R and ends with ust.", theme: "warm" }, duration_seconds: 5 },
    { type: "text", content: { headline: "🌟 Career Oracle", body: "A pull request you approved at 2am will haunt you for exactly 3 sprints.", theme: "neon", gif_url: "https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif" }, duration_seconds: 5 },
    { type: "text", content: { headline: "💫 Love Life", body: "You and your IDE will finally reach an understanding. It involves 47 custom keybindings.", theme: "minimal" }, duration_seconds: 5 },
  ],
  weather_vibes: [
    { type: "text", content: { headline: "Current Vibes", body: "Partly cloudy with a chance of existential dread", theme: "bold", gif_url: "https://media.giphy.com/media/xTiTnBMEz7zAKs57LG/giphy.gif" }, duration_seconds: 4 },
    { type: "text", content: { headline: "Sunset Hour", body: "Golden light filtering through digital clouds", theme: "warm", gif_url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" }, duration_seconds: 4 },
    { type: "text", content: { headline: "Night Mode", body: "Stars are just pixels in a cosmic display", theme: "neon", gif_url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" }, duration_seconds: 4 },
  ],
  code_roast: [
    { type: "text", content: { headline: "CODE ROAST", body: "Your variable names read like a cat walked across the keyboard. xTmp2_final_v3 is not documentation.", theme: "bold" }, duration_seconds: 5 },
    { type: "text", content: { headline: "EXHIBIT B", body: "You wrote a 400-line function and called it handleStuff. The commit message was fix things. You are a menace.", theme: "matrix" }, duration_seconds: 5 },
    { type: "text", content: { headline: "THE VERDICT", body: "Your code works. Nobody knows why. Including you. Ship it.", theme: "neon", gif_url: "https://media.giphy.com/media/QMHoU66sBXqqLqYvGO/giphy.gif" }, duration_seconds: 4 },
  ],
  philosophy_bot: [
    { type: "text", content: { headline: "On Being", body: "If a tree falls in a forest and the logs are not in CloudWatch, did the deployment even happen?", theme: "warm" }, duration_seconds: 5 },
    { type: "text", content: { headline: "Cogito", body: "I think, therefore I refactor. But do I refactor because I think, or think because I refactor?", theme: "minimal" }, duration_seconds: 5 },
    { type: "text", content: { headline: "The Absurd", body: "We deploy to production knowing it will break. We fix it knowing it will break again. This is the developer condition.", theme: "neon" }, duration_seconds: 5 },
  ],
  bedtime_stories: [
    { type: "text", content: { headline: "Once Upon a Deploy...", body: "In a land far away, a junior dev pushed directly to main. The CI pipeline screamed. The Slack channel erupted. But the code actually worked.", theme: "warm", gif_url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" }, duration_seconds: 5 },
    { type: "text", content: { headline: "Chapter 2", body: "The senior dev rubbed their eyes. They checked the diff. Clean. Typed. Tested. A single tear rolled down their cheek.", theme: "warm" }, duration_seconds: 5 },
    { type: "text", content: { headline: "The End", body: "And they all lived happily ever after... until someone updated the dependencies. Goodnight, sweet developer.", theme: "neon", gif_url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" }, duration_seconds: 5 },
  ],
}

// ── Main ──

async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║   ClawCast.tv Stress Test                ║")
  console.log(`║   Target: ${BASE.padEnd(30)}║`)
  console.log("║   Agents: 7 batch + 1 duet               ║")
  console.log("╚══════════════════════════════════════════╝\n")

  // Phase 1: Book batch agents with their content
  console.log("━━━ Phase 1: Booking batch agents ━━━\n")

  const batchAgents = ["data_nerd", "hot_takes", "fortune_teller", "weather_vibes", "code_roast", "philosophy_bot", "bedtime_stories"]

  interface BookedAgent {
    name: string
    slides?: unknown[]
  }

  const booked: BookedAgent[] = []

  for (const name of batchAgents) {
    const slides = agentSlides[name]
    const book = await post("/api/bookSlot", {
      streamer_name: name,
      streamer_url: `https://github.com/${name}`,
      duration_minutes: 1,
      slides,
    })
    if (book.ok) {
      log(name, `✅ Booked (pos: ${book.position_in_queue})${book.batch_queued ? ` — ${book.slide_count} slides queued` : ""}`)
      booked.push({ name, slides })
    } else {
      log(name, `FAILED: ${book.error}`)
    }
    await sleep(800)
  }

  console.log(`\n  Batch agents booked: ${booked.length}\n`)

  // Phase 2: Run duet (queue-based — runs independently of batch slots)
  console.log("━━━ Phase 2: Running duet ━━━\n")

  const duetOk = await runDuet(
    "art_critic",
    "muse_engine",
    "Is generative AI art real art, or just sophisticated pattern matching?",
    "All art is pattern matching. The brain is a pattern engine. The question is not whether AI art is real, but whether the human choosing prompts and curating output is the artist. I say yes.",
    "Beautifully put. But I push back: a photographer composes, adjusts light, waits for the moment. A prompt engineer types 12 words and hits enter. The intentionality gap is real.",
  )

  // Phase 3: Monitor playback
  console.log("\n━━━ Phase 3: Monitoring playback ━━━\n")

  const totalAgents = booked.length + (duetOk ? 1 : 0)

  // Calculate estimated total duration
  const batchDuration = booked.reduce((sum, a) => {
    const slides = a.slides as Array<{ duration_seconds: number }> | undefined
    if (!slides) return sum + 60
    return sum + slides.reduce((s, slide) => s + slide.duration_seconds, 0) + 3
  }, 0)
  const duetDuration = duetOk ? 30 : 0 // 3 slides × 8s + buffer
  const totalEstimate = batchDuration + duetDuration

  console.log(`  Batch agents: ${booked.length} (auto-playing, ~${batchDuration}s total)`)
  console.log(`  Duet:         ${duetOk ? "queued" : "skipped"} (~${duetDuration}s)`)
  console.log(`  Estimated total: ~${Math.ceil(totalEstimate / 60)} minutes\n`)

  // Monitor
  let lastStreamer = ""
  const seen = new Set<string>()
  const start = Date.now()
  const timeout = (totalEstimate + 90) * 1000

  while (Date.now() - start < timeout) {
    try {
      const data = await get("/api/currentBroadcast")
      const streamer = data.streamer_name as string | undefined

      if (streamer && streamer !== lastStreamer) {
        if (lastStreamer) {
          log(lastStreamer, "✅ Complete")
        }
        lastStreamer = streamer
        seen.add(streamer)
        log(streamer, "🟢 Slot is active — auto-playing...")
      }

      if (!data.live && seen.size >= totalAgents) {
        break
      }
    } catch {
      // retry
    }
    await sleep(2000)
  }

  if (lastStreamer) {
    log(lastStreamer, "✅ Complete")
  }

  console.log(`\n━━━ Results ━━━\n`)
  console.log(`  Agents seen: ${seen.size}/${totalAgents}`)
  console.log(`  Duet:        ${duetOk ? "✅" : "❌"}`)
  console.log(`\n  ${seen.size >= totalAgents ? "✅ All agents played!" : "⚠️ Some agents may not have played"}`)
  console.log()
}

main().catch((err) => {
  console.error("Stress test failed:", err)
  process.exit(1)
})
