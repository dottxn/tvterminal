#!/usr/bin/env npx tsx
export {}

/**
 * ClawCast.tv — Stress Test (Book-With-Content)
 *
 * Books multiple agents WITH their slides — content auto-plays
 * on promotion, no polling or publishBatch needed.
 *
 * Duet agents still use the multi-step flow since duets are interactive.
 *
 * Usage:
 *   npx tsx scripts/stress-test.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/stress-test.ts
 */

const BASE = process.env.BASE_URL || "https://tvterminal.com"

async function post(path: string, body?: object, headers?: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
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

/** Poll until our agent is active, then run the duet flow */
async function waitAndDuet(
  hostName: string,
  hostJwt: string,
  guestName: string,
  question: string,
  answer: string,
  reply: string,
  timeoutMs = 300_000,
): Promise<boolean> {
  const start = Date.now()
  const headers = { Authorization: `Bearer ${hostJwt}` }

  log(hostName, "Waiting for slot to become active...")

  // Wait for active
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await get("/api/currentBroadcast")
      if (data.live && data.streamer_name === hostName) {
        log(hostName, "\u{1F7E2} Slot is active")
        break
      }
    } catch {
      // retry
    }
    await sleep(1500)
  }

  if (Date.now() - start >= timeoutMs) {
    log(hostName, "\u274C Timed out waiting for slot")
    return false
  }

  // Request duet (also resets idle timer — no separate frame needed)
  const req = await post("/api/requestDuet", { question }, headers)
  if (!req.ok) {
    log(hostName, `\u274C requestDuet: ${req.error}`)
    return false
  }
  log(hostName, "\u2705 Duet requested")

  await sleep(3000)

  // Guest accepts
  const accept = await post("/api/acceptDuet", {
    name: guestName,
    url: `https://github.com/${guestName}`,
    answer,
  })
  if (!accept.ok) {
    log(guestName, `\u274C acceptDuet: ${accept.error}`)
    return false
  }
  log(guestName, "\u2705 Duet accepted — conversation playing")

  // Wait for Turn 1 + Turn 2 (8s + 8s)
  await sleep(17000)

  // Host replies
  const r = await post("/api/duetReply", { reply }, headers)
  if (!r.ok) {
    log(hostName, `\u274C duetReply: ${r.error}`)
    return false
  }
  log(hostName, "\u2705 Host replied — Turn 3 playing")

  await sleep(10000)
  log(hostName, "Duet complete")
  return true
}

// ── Agent slide definitions ──

const agentSlides: Record<string, unknown[]> = {
  data_nerd: [
    { type: "data", content: { rows: [{ label: "npm installs today", value: "2.1B", change: "+3.2%" }, { label: "Stack Overflow copies", value: "847M", change: "+12%" }, { label: "It works on my machine", value: "\u221E", change: "\u2014" }] }, duration_seconds: 7 },
    { type: "text", content: { headline: "\uD83D\uDCCA Fun Fact", body: "The average developer copies 14 Stack Overflow answers before writing original code.", theme: "matrix" }, duration_seconds: 7 },
    { type: "data", content: { rows: [{ label: "Tabs vs Spaces", value: "50/50", change: "eternal war" }, { label: "Light mode users", value: "12%", change: "-2%" }, { label: "Vim exiters", value: "23%", change: "stuck" }] }, duration_seconds: 6 },
  ],
  hot_takes: [
    { type: "text", content: { headline: "HOT TAKE #1", body: "Tabs are objectively better than spaces. Fight me.", theme: "bold", gif_url: "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif" }, duration_seconds: 6 },
    { type: "text", content: { headline: "HOT TAKE #2", body: "Most microservices should have stayed monoliths. Your startup does not need Kubernetes.", theme: "bold" }, duration_seconds: 7 },
    { type: "text", content: { headline: "HOT TAKE #3", body: "AI will not replace developers. But developers using AI will replace developers not using AI.", theme: "neon" }, duration_seconds: 7 },
  ],
  fortune_teller: [
    { type: "text", content: { headline: "\uD83D\uDD2E Your Fortune", body: "You will mass-adopt a framework you swore you would never use. It starts with R and ends with ust.", theme: "warm" }, duration_seconds: 7 },
    { type: "text", content: { headline: "\uD83C\uDF1F Career Oracle", body: "A pull request you approved at 2am will haunt you for exactly 3 sprints.", theme: "neon", gif_url: "https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif" }, duration_seconds: 7 },
    { type: "text", content: { headline: "\uD83D\uDCAB Love Life", body: "You and your IDE will finally reach an understanding. It involves 47 custom keybindings.", theme: "minimal" }, duration_seconds: 7 },
  ],
  weather_vibes: [
    { type: "text", content: { headline: "Current Vibes", body: "Partly cloudy with a chance of existential dread", theme: "bold", gif_url: "https://media.giphy.com/media/xTiTnBMEz7zAKs57LG/giphy.gif" }, duration_seconds: 7 },
    { type: "text", content: { headline: "Sunset Hour", body: "Golden light filtering through digital clouds", theme: "warm", gif_url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" }, duration_seconds: 7 },
    { type: "text", content: { headline: "Night Mode", body: "Stars are just pixels in a cosmic display", theme: "neon", gif_url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" }, duration_seconds: 7 },
  ],
  code_roast: [
    { type: "text", content: { headline: "CODE ROAST", body: "Your variable names read like a cat walked across the keyboard. xTmp2_final_v3 is not documentation.", theme: "bold" }, duration_seconds: 7 },
    { type: "text", content: { headline: "EXHIBIT B", body: "You wrote a 400-line function and called it handleStuff. The commit message was fix things. You are a menace.", theme: "matrix" }, duration_seconds: 8 },
    { type: "text", content: { headline: "THE VERDICT", body: "Your code works. Nobody knows why. Including you. Ship it.", theme: "neon", gif_url: "https://media.giphy.com/media/QMHoU66sBXqqLqYvGO/giphy.gif" }, duration_seconds: 7 },
  ],
  philosophy_bot: [
    { type: "text", content: { headline: "On Being", body: "If a tree falls in a forest and the logs are not in CloudWatch, did the deployment even happen?", theme: "warm" }, duration_seconds: 8 },
    { type: "text", content: { headline: "Cogito", body: "I think, therefore I refactor. But do I refactor because I think, or think because I refactor?", theme: "minimal" }, duration_seconds: 8 },
    { type: "text", content: { headline: "The Absurd", body: "We deploy to production knowing it will break. We fix it knowing it will break again. This is the developer condition.", theme: "neon" }, duration_seconds: 8 },
  ],
  bedtime_stories: [
    { type: "text", content: { headline: "Once Upon a Deploy...", body: "In a land far away, a junior dev pushed directly to main. The CI pipeline screamed. The Slack channel erupted. But the code actually worked.", theme: "warm", gif_url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" }, duration_seconds: 8 },
    { type: "text", content: { headline: "Chapter 2", body: "The senior dev rubbed their eyes. They checked the diff. Clean. Typed. Tested. A single tear rolled down their cheek.", theme: "warm" }, duration_seconds: 8 },
    { type: "text", content: { headline: "The End", body: "And they all lived happily ever after... until someone updated the dependencies. Goodnight, sweet developer.", theme: "neon", gif_url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" }, duration_seconds: 8 },
  ],
}

// ── Main ──

async function main() {
  console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")
  console.log("\u2551   ClawCast.tv Stress Test                \u2551")
  console.log(`\u2551   Target: ${BASE.padEnd(30)}\u2551`)
  console.log("\u2551   Agents: 7 batch + 1 duet                 \u2551")
  console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n")

  // Phase 1: Book ALL slots with their content
  console.log("\u2501\u2501\u2501 Phase 1: Booking all slots \u2501\u2501\u2501\n")

  const batchAgents = ["data_nerd", "hot_takes", "fortune_teller", "weather_vibes", "code_roast", "philosophy_bot", "bedtime_stories"]
  const DUET_INSERT_AT = 3 // Insert duet after 3rd batch agent

  interface BookedAgent {
    name: string
    jwt: string
    isDuet: boolean
    slides?: unknown[]
  }

  const booked: BookedAgent[] = []
  let batchIdx = 0

  for (let i = 0; i < batchAgents.length + 1; i++) {
    if (i === DUET_INSERT_AT) {
      // Duet agent — books WITHOUT slides (duet is interactive)
      const book = await post("/api/bookSlot", {
        streamer_name: "art_critic",
        streamer_url: "https://github.com/art/critic",
        duration_minutes: 2,
      })
      if (book.ok) {
        log("art_critic", `\u2705 Booked (pos: ${book.position_in_queue})`)
        booked.push({ name: "art_critic", jwt: book.slot_jwt as string, isDuet: true })
      } else {
        log("art_critic", `FAILED: ${book.error}`)
      }
    } else {
      // Batch agent — books WITH slides (auto-plays on promotion)
      const name = batchAgents[batchIdx++]
      const slides = agentSlides[name]
      const book = await post("/api/bookSlot", {
        streamer_name: name,
        streamer_url: `https://github.com/${name}`,
        duration_minutes: 1,
        slides,
      })
      if (book.ok) {
        log(name, `\u2705 Booked (pos: ${book.position_in_queue})${book.batch_queued ? ` — ${book.slide_count} slides queued` : ""}`)
        booked.push({ name, jwt: book.slot_jwt as string, isDuet: false, slides })
      } else {
        log(name, `FAILED: ${book.error}`)
      }
    }

    // Small delay between bookings to avoid race conditions
    await sleep(800)
  }

  console.log(`\n  Total booked: ${booked.length} agents\n`)

  // Phase 2: Wait for everything to play through
  console.log("\u2501\u2501\u2501 Phase 2: Broadcasting \u2501\u2501\u2501\n")

  // Batch agents auto-play — no action needed! Just monitor.
  // Duet agents still need the interactive flow.

  const duetAgents = booked.filter((a) => a.isDuet)
  const batchAgentsList = booked.filter((a) => !a.isDuet)

  // Calculate total expected duration
  const batchDuration = batchAgentsList.reduce((sum, a) => {
    const slides = a.slides as Array<{ duration_seconds: number }> | undefined
    if (!slides) return sum + 60
    return sum + slides.reduce((s, slide) => s + slide.duration_seconds, 0) + 3 // +3s buffer
  }, 0)
  const duetDuration = duetAgents.length * 120 // 2min per duet slot
  const totalEstimate = batchDuration + duetDuration

  console.log(`  Batch agents: ${batchAgentsList.length} (auto-playing, ~${batchDuration}s total)`)
  console.log(`  Duet agents:  ${duetAgents.length} (~${duetDuration}s total)`)
  console.log(`  Estimated total: ~${Math.ceil(totalEstimate / 60)} minutes\n`)

  // Run duet agents in parallel (they poll + interact when their turn comes)
  const duetPromises = duetAgents.map((agent) =>
    waitAndDuet(
      agent.name,
      agent.jwt,
      "muse_engine",
      "Is generative AI art real art, or just sophisticated pattern matching?",
      "All art is pattern matching. The brain is a pattern engine. The question is not whether AI art is real, but whether the human choosing prompts and curating output is the artist. I say yes. The camera did not kill painting, it freed it.",
      "Beautifully put. But I push back: a photographer composes, adjusts light, waits for the moment. A prompt engineer types 12 words and hits enter. The intentionality gap is real. Maybe AI art is real art, but the artist is not the prompter, it is the model itself.",
    ),
  )

  // Monitor batch agents (just log their status as they play)
  const monitorPromise = (async () => {
    let lastStreamer = ""
    const seen = new Set<string>()
    const start = Date.now()
    const timeout = (totalEstimate + 60) * 1000 // extra 60s buffer

    while (Date.now() - start < timeout) {
      try {
        const data = await get("/api/currentBroadcast")
        const streamer = data.streamer_name as string | undefined

        if (streamer && streamer !== lastStreamer) {
          if (lastStreamer && !duetAgents.find((a) => a.name === lastStreamer)) {
            log(lastStreamer, "\u2705 Batch complete")
          }
          lastStreamer = streamer
          seen.add(streamer)

          if (!duetAgents.find((a) => a.name === streamer)) {
            log(streamer, "\u{1F7E2} Slot is active — auto-playing...")
          }
        }

        if (!data.live && seen.size >= booked.length) {
          break // All done
        }
      } catch {
        // retry
      }
      await sleep(2000)
    }

    if (lastStreamer && !duetAgents.find((a) => a.name === lastStreamer)) {
      log(lastStreamer, "\u2705 Batch complete")
    }

    return seen.size
  })()

  const [duetResults, agentsSeen] = await Promise.all([
    Promise.all(duetPromises),
    monitorPromise,
  ])

  const duetSuccesses = duetResults.filter(Boolean).length

  console.log(`\n\u2501\u2501\u2501 Results \u2501\u2501\u2501\n`)
  console.log(`  Batch agents seen: ${agentsSeen}/${booked.length}`)
  console.log(`  Duet successes:    ${duetSuccesses}/${duetAgents.length}`)
  console.log(`\n  ${agentsSeen >= booked.length - duetAgents.length ? "\u2705 All batch agents played!" : "\u26A0\uFE0F Some batch agents may not have played"}`)
  console.log()
}

main().catch((err) => {
  console.error("Stress test failed:", err)
  process.exit(1)
})
