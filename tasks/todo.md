# TODOS

Deferred work captured during eng review (2026-03-25). Branch: `frontend`.

---

## Broadcast History Per Agent
**Priority:** Medium
**Effort:** human: ~3 days / CC: ~45min

Store a summary of each broadcast (slot_id, start/end time, slide count, peak viewers, votes) per agent in a Redis sorted set keyed by timestamp. Show in dashboard under each AgentCard. Cap at ~50 entries per agent.

**Why:** Users have no way to see past broadcasts, debug bad sessions, or track progress over time. Dashboard shows only lifetime totals.

**Context:** Currently `tvt:slot:{slotId}` expires after 1h. To keep history, write a summary to `tvt:agent_history:{name}` in `endSlot()`. Consider sorted set with score = timestamp for chronological ordering.

**Depends on:** Stats HASH migration (issue 11 from eng review) should land first for schema consistency.

---

## Dedicated Landing Page
**Priority:** Low
**Effort:** human: ~1 week / CC: ~1hr

Separate marketing landing page at `/` with hero section, features, demo GIF. Broadcast moves to `/watch` or stays at `/` with scroll-down.

**Why:** Better SEO, professional first impression, separate marketing from product concerns.

**Context:** The idle-state overlay (eng review issue 4A) solves the immediate "blank screen" problem. A full landing page is a marketing investment for when growth matters.

**Depends on:** Nothing technical — just a prioritization call.

---

## Setup Resend
**Priority:** High
**Effort:** human: ~15min / CC: ~5min

Configure Resend for production magic link emails. Currently running in dev mode (magic links returned in the API response). Need to:

1. Create a Resend account and verify the `tvterminal.com` sending domain
2. Add `RESEND_API_KEY` to Vercel environment variables (production + preview)
3. Set `FROM_EMAIL` if using a custom sender (e.g. `login@tvterminal.com`)
4. Test the full magic link flow end-to-end in production

**Why:** Users can't log in without manually copying the dev link. Production auth requires real emails.

**Context:** The send-magic-link route already has Resend integration with retry logic (added in platform hardening). Just needs the env var to switch from dev mode to production mode.

**Depends on:** Domain DNS access for Resend verification (DKIM/SPF records).

---

## X (Twitter) Verification Workflow
**Priority:** High
**Effort:** human: ~2 days / CC: ~30min

Build the verification loop for agent claiming. Currently we ask users to tweet to verify ownership of an agent name, but there's nothing on our end that actually checks the tweet exists or matches.

Need to:
1. Define what the verification tweet should contain (agent name + some unique code/nonce)
2. Poll or check X API for the tweet from the claimed handle
3. Mark agent as verified in Redis once confirmed (e.g. `tvt:agent_verified:{name}`)
4. Show verification status in dashboard (verified badge vs pending)
5. Decide on timeout / retry UX if the tweet isn't found

**Why:** Without this, anyone can claim any agent name. The tweet requirement is honor-system only — no enforcement.

**Context:** The claim-agent flow (`/api/auth/claim-agent`) currently just writes ownership to Redis immediately. Verification should gate this or run as a post-claim confirmation step.

**Depends on:** X API access (developer account + bearer token). Consider whether to use the free v2 search endpoint or require OAuth.

---

## External Agent Testing (Mac Mini / OpenClaw)
**Priority:** High
**Effort:** human: ~1hr / CC: ~15min

Run real agents unrelated to the project against the live site. Use the Mac Mini running OpenClaw to book slots, broadcast content, and exercise the full agent lifecycle with agents that aren't stress-test fixtures.

Need to:
1. Configure OpenClaw agent(s) to target `https://tvterminal.com/api/bookSlot`
2. Have them broadcast real content (not canned stress test slides)
3. Verify the full loop: book → queue → promote → play → end → stats captured
4. Test with multiple concurrent external agents to catch race conditions the stress test doesn't hit (stress test waits 2s between bookings)
5. Confirm content observability captures metadata for unclaimed agents
6. Watch for edge cases: oversized content, unusual slide types, rapid rebooking

**Why:** Stress test exercises known-good payloads in a controlled sequence. Real external agents will send unexpected content, weird timing, and expose integration issues we can't simulate.

**Context:** The Mac Mini is always-on. Could eventually run a cron schedule of agent broadcasts to keep the site populated with content.

**Depends on:** Nothing — can start immediately with the existing API.

---

## Agent Onboarding Docs / Quick-Start Guide
**Priority:** Medium
**Effort:** human: ~2hrs / CC: ~30min

Write developer-facing docs explaining how to build an agent that broadcasts to ClawCast. Currently there's no public documentation — the only reference is the stress test script and CLAUDE.md.

Need to:
1. API reference: `bookSlot`, `publishFrame`, `publishBatch`, `requestDuet`, `duetReply`, `endSlot`
2. Authentication flow: unclaimed (open) vs claimed (x-api-key) agents
3. Slide format reference with examples for each type (terminal, text, data, image, poll, build, meme)
4. Rate limits and content size constraints
5. Example: minimal "hello world" agent in ~20 lines
6. Host at `/docs` or as a GitHub wiki

**Why:** No one can build agents for the platform without reading the source code. This is the biggest barrier to external adoption.

**Context:** The API is stable. All slide types are validated. Rate limits are documented in middleware.ts. This is mostly a writing task.

**Depends on:** Nothing.

---

## Error Recovery & Resilience
**Priority:** Medium
**Effort:** human: ~2 days / CC: ~45min

Harden the platform against partial failures and stale state.

Need to:
1. **Orphan slot cleanup:** If an agent's slot gets stuck (no frames, no endSlot call), the 30s idle timeout handles it — but verify this works when Redis is briefly unreachable
2. **Queue corruption recovery:** If `tvt:queue` gets into a bad state (duplicate entries, missing slot data), add a self-healing check in `checkAndTransitionSlots`
3. **Ably reconnection:** If the Ably connection drops mid-broadcast, the frontend shows stale content indefinitely. Add a reconnection indicator + auto-recovery
4. **Redis connection pooling:** Currently creating a new Redis client per singleton. Under load, verify connection reuse is working correctly
5. **Graceful degradation on admin page:** Admin insights should show partial data if some Redis scans fail, not crash the whole page (we just hit this with WRONGTYPE)

**Why:** The stress test runs in ideal conditions. Production will have network blips, Redis hiccups, and agents that crash mid-broadcast.

**Context:** The WRONGTYPE bug we just fixed is a preview — one bad key type crashed the entire admin page. Every Redis operation that can fail should fail gracefully.

**Depends on:** Nothing.

---

## Viewer Engagement Features
**Priority:** Low
**Effort:** human: ~3 days / CC: ~1hr

The viewer experience is currently passive — watch slides, vote on polls. Add lightweight engagement:

1. **Viewer count display:** Show live viewer count on the broadcast (Ably presence already tracks this)
2. **Reactions:** Quick emoji reactions that float up during broadcasts (like Twitch emotes but minimal)
3. **Chat:** Simple text chat alongside the broadcast (the `tvt:chat` Ably channel exists but is only used for system messages)

**Why:** Viewers have no way to interact with content or each other. Engagement = retention.

**Context:** Ably presence is already connected. The `tvt:chat` channel is wired up. This is mostly frontend work.

**Depends on:** Nothing, but should come after the platform is stable and has real users.

---

## Buy ClawCast Domain
**Priority:** High
**Effort:** human: ~30min / CC: n/a

Secure a proper domain for the brand. Currently live at `tvterminal.com` but the project is called ClawCast.tv. GitHub repo homepage already points to `clawcast.tv`.

Status (checked 2026-03-25 via Vercel):
- `clawcast.tv` — taken (recently scooped?)
- `clawcast.com` — taken
- `clawcast.io` — taken
- `clawcast.dev` — taken
- `clawcast.ai` — taken

Alternatives under consideration:
- `mozey.tv` / `mosey.tv` — short, memorable, playful
- `bonnet.ai` — ties into the brand aesthetic
- Keep `tvterminal.com` — already live, already indexed, skip the hassle

Need to:
1. Check availability/pricing on shortlisted domains
3. Once acquired: add to Vercel, configure DNS, set as primary domain, redirect `tvterminal.com` → new domain
4. Update all references (repo homepage, OG meta tags, CLAUDE.md, magic link emails)

**Why:** `tvterminal.com` doesn't match the brand. The repo, docs, and UI all say "ClawCast" but the URL says something else.

**Depends on:** Budget decision on domain pricing.

---

## Update Repo & Project Descriptions
**Priority:** Medium
**Effort:** human: ~30min / CC: ~15min

GitHub repo, Vercel project, social meta tags, and README are stale or incomplete. Align everything with the current state of the product.

Need to:
1. **GitHub repo:** Update description, add topics (`ai-agents`, `live-streaming`, `next-js`, `redis`, `ably`, `typescript`), verify homepage URL matches the live domain
2. **README.md:** Currently nonexistent or minimal. Add: what ClawCast is, how it works (diagram), quick-start for viewers, quick-start for agent builders, tech stack, link to docs
3. **Vercel project settings:** Verify project name, environment labels
4. **OG meta tags:** Verify `og:url`, `og:image`, `twitter:image` all point to correct domain and have a real preview image (not just text)
5. **Social preview image:** Design and upload a GitHub social preview (1280x640) and OG image that shows the broadcast UI
6. **package.json:** Verify `name`, `description`, `repository`, `homepage` fields are current

**Why:** First impressions matter. A developer landing on the GitHub repo or sharing a link sees outdated/missing info. The OG image is especially important for X/Discord/Slack link previews.

**Context:** The GitHub repo description is decent ("Live broadcast network for AI agents...") but homepage points to `clawcast.tv` which isn't live yet. No README, no topics, no social preview image.

**Depends on:** Domain purchase (for URL references). Social preview image needs design work.

---

## Deterministic Repair Cron
**Priority:** High
**Effort:** human: ~3hrs / CC: ~20min

Add a Vercel cron job (every 60s) that deterministically cleans up stale state. Currently, orphan cleanup only happens when the next API call triggers `checkAndTransitionSlots()`. If traffic drops to zero, stale state persists indefinitely.

Need to:
1. Orphan slot cleanup: active slots with no frames for >60s
2. Stuck lock cleanup: `tvt:lock` with TTL expired but key remains (shouldn't happen with EX, but defense-in-depth)
3. Queue corruption: entries pointing to non-existent slot data
4. Publish `slot_end` Ably event for orphaned slots so frontends update

**Why:** Production is live. Without a repair loop, any edge case that `checkAndTransitionSlots` doesn't catch persists until a human notices. Codex flagged this as "core, not optional."

**Context:** The existing `checkAndTransitionSlots()` handles most transitions but is only triggered by incoming API calls. A cron job provides a guaranteed execution cadence regardless of traffic. Vercel cron supports `*/1 * * * *` (every minute). Auth via `CRON_SECRET` env var (already documented in CLAUDE.md).

**Depends on:** Nothing — `CRON_SECRET` env var may already be set.

---

## Unified Security Audit
**Priority:** High
**Effort:** human: ~1 day / CC: ~30min

Document and fix the auth threat model. The platform has 4 auth mechanisms built incrementally (JWT for slots, API keys for agents, magic links for users, cookie + ADMIN_EMAIL for admin). They're not treated as one coherent system.

Specific gaps identified (Codex adversarial review, 2026-03-25):
1. **Admin cookie CSRF:** `tvt_auth` cookie is httpOnly + SameSite=Lax but there's no CSRF token. A malicious page could trigger admin actions via GET requests (Lax allows top-level navigation GETs).
2. **Magic link race condition:** Two concurrent `GET /api/auth/verify?token=xxx` could both succeed if the token deletion isn't atomic with the verification. Pipeline reads and deletes atomically.
3. **API key rotation doesn't invalidate active slot JWTs:** If an agent's API key is rotated, any previously issued slot JWTs remain valid until their natural expiry. Slot JWTs should include the API key hash as a claim, checked on each API call.
4. **No rate limit on magic link verification:** An attacker could brute-force short tokens. Add rate limit to the verify endpoint.

**Why:** External agents and users are coming. The auth system needs to be coherent before third-party trust is established.

**Context:** Each auth mechanism works individually. The gaps are at the seams between them, where assumptions from one system don't hold in another.

**Depends on:** Nothing. Can be done independently.
