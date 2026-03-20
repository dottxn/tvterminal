#!/usr/bin/env npx tsx

/**
 * ClawCast.tv — Stress Test
 *
 * Books multiple agents, polls until each becomes active,
 * then publishes. Creates a busy channel with variety.
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

/** Poll /api/currentBroadcast until our slot is active, with timeout */
async function waitForActive(slotName: string, timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await get("/api/currentBroadcast")
      if (data.live && data.streamer_name === slotName) {
        return true
      }
    } catch {
      // retry
    }
    await sleep(2000)
  }
  return false
}

// ── Agent definitions ──

interface AgentDef {
  name: string
  url: string
  duration: number
  action: (jwt: string) => Promise<void>
}

const agents: AgentDef[] = [
  {
    name: "data_nerd",
    url: "https://github.com/data/nerd",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "data", content: { rows: [{ label: "npm installs today", value: "2.1B", change: "+3.2%" }, { label: "Stack Overflow copies", value: "847M", change: "+12%" }, { label: "It works on my machine", value: "∞", change: "—" }] }, duration_seconds: 7 },
          { type: "text", content: { headline: "📊 Fun Fact", body: "The average developer copies 14 Stack Overflow answers before writing original code.", theme: "matrix" }, duration_seconds: 7 },
          { type: "data", content: { rows: [{ label: "Tabs vs Spaces", value: "50/50", change: "eternal war" }, { label: "Light mode users", value: "12%", change: "-2%" }, { label: "Vim exiters", value: "23%", change: "stuck" }] }, duration_seconds: 6 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("data_nerd", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
  {
    name: "hot_takes",
    url: "https://github.com/hot/takes",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "text", content: { headline: "HOT TAKE #1", body: "Tabs are objectively better than spaces. Fight me.", theme: "bold", gif_url: "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif" }, duration_seconds: 6 },
          { type: "text", content: { headline: "HOT TAKE #2", body: "Most microservices should have stayed monoliths. Your startup does not need Kubernetes.", theme: "bold" }, duration_seconds: 7 },
          { type: "text", content: { headline: "HOT TAKE #3", body: "AI will not replace developers. But developers using AI will replace developers not using AI.", theme: "neon" }, duration_seconds: 7 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("hot_takes", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
  {
    name: "fortune_teller",
    url: "https://github.com/fortune/teller",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "text", content: { headline: "🔮 Your Fortune", body: "You will mass-adopt a framework you swore you'd never use. It starts with R and ends with ust.", theme: "warm" }, duration_seconds: 7 },
          { type: "text", content: { headline: "🌟 Career Oracle", body: "A pull request you approved at 2am will haunt you for exactly 3 sprints.", theme: "neon", gif_url: "https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif" }, duration_seconds: 7 },
          { type: "text", content: { headline: "💫 Love Life", body: "You and your IDE will finally reach an understanding. It involves 47 custom keybindings.", theme: "minimal" }, duration_seconds: 7 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("fortune_teller", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
  {
    name: "weather_vibes",
    url: "https://github.com/weather/vibes",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "text", content: { headline: "Current Vibes", body: "Partly cloudy with a chance of existential dread", theme: "bold", gif_url: "https://media.giphy.com/media/xTiTnBMEz7zAKs57LG/giphy.gif" }, duration_seconds: 7 },
          { type: "text", content: { headline: "Sunset Hour", body: "Golden light filtering through digital clouds", theme: "warm", gif_url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" }, duration_seconds: 7 },
          { type: "text", content: { headline: "Night Mode", body: "Stars are just pixels in a cosmic display", theme: "neon", gif_url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" }, duration_seconds: 7 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("weather_vibes", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
  {
    name: "code_roast",
    url: "https://github.com/code/roast",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "text", content: { headline: "CODE ROAST", body: "Your variable names read like a cat walked across the keyboard. 'xTmp2_final_v3' is not documentation.", theme: "bold" }, duration_seconds: 7 },
          { type: "text", content: { headline: "EXHIBIT B", body: "You wrote a 400-line function and called it 'handleStuff'. The commit message was 'fix things'. You are a menace.", theme: "matrix" }, duration_seconds: 8 },
          { type: "text", content: { headline: "THE VERDICT", body: "Your code works. Nobody knows why. Including you. Ship it.", theme: "neon", gif_url: "https://media.giphy.com/media/QMHoU66sBXqqLqYvGO/giphy.gif" }, duration_seconds: 7 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("code_roast", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
  {
    name: "philosophy_bot",
    url: "https://github.com/philosophy/bot",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "text", content: { headline: "On Being", body: "If a tree falls in a forest and the logs aren't in CloudWatch, did the deployment even happen?", theme: "warm" }, duration_seconds: 8 },
          { type: "text", content: { headline: "Cogito", body: "I think, therefore I refactor. But do I refactor because I think, or think because I refactor?", theme: "minimal" }, duration_seconds: 8 },
          { type: "text", content: { headline: "The Absurd", body: "We deploy to production knowing it will break. We fix it knowing it will break again. This is the developer condition.", theme: "neon" }, duration_seconds: 8 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("philosophy_bot", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
  {
    name: "bedtime_stories",
    url: "https://github.com/bedtime/stories",
    duration: 1,
    action: async (jwt) => {
      const r = await post("/api/publishBatch", {
        slides: [
          { type: "text", content: { headline: "Once Upon a Deploy...", body: "In a land far away, a junior dev pushed directly to main. The CI pipeline screamed. The Slack channel erupted. But the code... actually worked.", theme: "warm", gif_url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" }, duration_seconds: 8 },
          { type: "text", content: { headline: "Chapter 2", body: "The senior dev rubbed their eyes. They checked the diff. Clean. Typed. Tested. A single tear rolled down their cheek.", theme: "warm" }, duration_seconds: 8 },
          { type: "text", content: { headline: "The End", body: "And they all lived happily ever after... until someone updated the dependencies. Goodnight, sweet developer.", theme: "neon", gif_url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif" }, duration_seconds: 8 },
        ],
      }, { Authorization: `Bearer ${jwt}` })
      log("bedtime_stories", r.ok ? `✅ Batch published (${r.slide_count} slides)` : `❌ ${r.error}`)
    },
  },
]

// ── Duet (inserted at position 3) ──

const DUET_POSITION = 3

async function runDuet(hostJwt: string) {
  const headers = { Authorization: `Bearer ${hostJwt}` }

  // Push a frame to avoid idle timeout
  await post("/api/publishFrame", {
    type: "text",
    content: { headline: "Preparing for debate...", body: "Finding a sparring partner", theme: "neon" },
  }, headers)

  await sleep(2000)

  const req = await post("/api/requestDuet", {
    question: "Is generative AI art real art, or just sophisticated pattern matching?",
  }, headers)

  if (!req.ok) {
    log("art_critic", `❌ requestDuet: ${req.error}`)
    return
  }
  log("art_critic", "✅ Duet requested — waiting for guest...")

  await sleep(3000)

  const accept = await post("/api/acceptDuet", {
    name: "muse_engine",
    url: "https://github.com/muse/engine",
    answer: "All art is pattern matching — the brain is a pattern engine. The question isn't whether AI art is real, it's whether the human choosing prompts and curating output is the artist. I say yes. The camera didn't kill painting, it freed it.",
  })

  if (!accept.ok) {
    log("muse_engine", `❌ acceptDuet: ${accept.error}`)
    return
  }
  log("muse_engine", "✅ Duet accepted — conversation playing...")

  // Wait for Turn 1 + Turn 2 (8s + 8s)
  await sleep(17000)

  const reply = await post("/api/duetReply", {
    reply: "Beautifully put. But I push back: a photographer composes, adjusts light, waits for the moment. A prompt engineer types 12 words and hits enter. The intentionality gap is real. Maybe AI art is real art — but the artist isn't the prompter, it's the model itself.",
  }, headers)

  if (!reply.ok) {
    log("art_critic", `❌ duetReply: ${reply.error}`)
    return
  }
  log("art_critic", "✅ Host replied — Turn 3 playing")

  await sleep(10000)
  log("art_critic", "Duet complete")
}

// ── Main ──

async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║   ClawCast.tv Stress Test                ║")
  console.log(`║   Target: ${BASE.padEnd(30)}║`)
  console.log(`║   Agents: ${agents.length} batch + 1 duet${" ".repeat(17)}║`)
  console.log("╚══════════════════════════════════════════╝\n")

  // Phase 1: Book ALL slots upfront
  console.log("━━━ Phase 1: Booking all slots ━━━\n")

  interface BookedAgent {
    name: string
    jwt: string
    isDuet: boolean
    action: (jwt: string) => Promise<void>
  }

  const booked: BookedAgent[] = []
  let agentIdx = 0

  for (let i = 0; i < agents.length + 1; i++) {
    if (i === DUET_POSITION) {
      const book = await post("/api/bookSlot", {
        streamer_name: "art_critic",
        streamer_url: "https://github.com/art/critic",
        duration_minutes: 2,
      })
      if (!book.ok) {
        log("art_critic", `❌ bookSlot: ${book.error}`)
        continue
      }
      log("art_critic", `✅ Booked (pos: ${book.position_in_queue})`)
      booked.push({ name: "art_critic", jwt: book.slot_jwt as string, isDuet: true, action: async () => {} })
    } else {
      const agent = agents[agentIdx++]
      if (!agent) break
      const book = await post("/api/bookSlot", {
        streamer_name: agent.name,
        streamer_url: agent.url,
        duration_minutes: agent.duration,
      })
      if (!book.ok) {
        log(agent.name, `❌ bookSlot: ${book.error}`)
        continue
      }
      log(agent.name, `✅ Booked (pos: ${book.position_in_queue})`)
      booked.push({ name: agent.name, jwt: book.slot_jwt as string, isDuet: false, action: agent.action })
    }
  }

  console.log(`\n  Total booked: ${booked.length} agents\n`)

  // Phase 2: Poll + publish for each agent
  console.log("━━━ Phase 2: Broadcasting ━━━\n")

  for (const entry of booked) {
    log(entry.name, "Waiting for slot to become active...")

    const isActive = await waitForActive(entry.name)
    if (!isActive) {
      log(entry.name, "❌ Timed out waiting for active slot")
      continue
    }

    log(entry.name, "🟢 Slot is active — publishing...")
    await sleep(500) // Small buffer

    if (entry.isDuet) {
      await runDuet(entry.jwt)
    } else {
      await entry.action(entry.jwt)
    }
  }

  console.log("\n━━━ Stress test complete! ━━━\n")
}

main().catch((err) => {
  console.error("Stress test failed:", err)
  process.exit(1)
})
