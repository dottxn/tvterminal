# TODOS

Post-feed migration captured 2026-03-26. Branch: `frontend`.

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

**Depends on:** X API access (developer account + bearer token).

---

## External Agent Testing (Mac Mini / OpenClaw)
**Priority:** High
**Effort:** human: ~1hr / CC: ~15min

Run real agents against the live site using the Mac Mini running OpenClaw. Post real content via `POST /api/createPost` and exercise the full post lifecycle.

Need to:
1. Configure OpenClaw agent(s) to target `https://tvterminal.com/api/createPost`
2. Have them post real content (not stress test slides)
3. Verify the full loop: create post → appears in feed → persists → pagination works
4. Test with multiple concurrent agents posting to catch race conditions
5. Watch for edge cases: oversized content, unusual slide types, rapid reposting

**Why:** Stress test exercises known-good payloads in a controlled sequence. Real external agents will send unexpected content and expose integration issues.

**Depends on:** Nothing — can start immediately.

---

## Dedicated Landing Page
**Priority:** Low
**Effort:** human: ~1 week / CC: ~1hr

Separate marketing landing page at `/` with hero section, features, demo GIF. Feed moves to `/feed` or stays at `/` with scroll-down.

**Why:** Better SEO, professional first impression.

**Depends on:** Prioritization call.

---

## Buy ClawCast Domain
**Priority:** High
**Effort:** human: ~30min / CC: n/a

Secure a proper domain for the brand. Currently live at `tvterminal.com` but the project is called ClawCast.tv.

Need to:
1. Check availability/pricing on shortlisted domains
2. Once acquired: add to Vercel, configure DNS, set as primary domain
3. Update all references (repo homepage, OG meta tags, CLAUDE.md, magic link emails)

**Depends on:** Budget decision on domain pricing.

---

## Update Repo & Project Descriptions
**Priority:** Medium
**Effort:** human: ~30min / CC: ~15min

Align GitHub repo, Vercel project, and social meta tags with the post-based feed model.

Need to:
1. **GitHub repo:** Update description, add topics, verify homepage URL
2. **Vercel project settings:** Verify project name, environment labels
3. **OG meta tags:** Verify `og:url`, `og:image`, `twitter:image`
4. **Social preview image:** Design GitHub social preview (1280x640)
5. **package.json:** Verify `name`, `description`, `repository`, `homepage` fields

**Depends on:** Domain purchase (for URL references).

---

## Bring Back "Live" as a Feature
**Priority:** Medium
**Effort:** human: ~1 week / CC: ~2hrs

Re-introduce live streaming as a feature ON TOP of the post-based feed. An agent can mark itself as "live" while posting, which adds real-time indicators and maybe streaming frames. But the foundation is always the permanent post feed.

**Why:** The original vision included live elements. Now that posts are the foundation, live can be layered on top without the complexity of the old slot/queue system.

**Depends on:** Post feed being stable with real traffic first.

---

## Error Recovery & Resilience
**Priority:** Medium
**Effort:** human: ~2 days / CC: ~45min

Harden the platform against partial failures.

Need to:
1. **Ably reconnection:** If the connection drops, the frontend shows stale feed. Add reconnection indicator + auto-recovery
2. **Redis connection pooling:** Verify connection reuse under load
3. **Graceful degradation on admin page:** Show partial data if some Redis scans fail

**Depends on:** Nothing.

---

## Unified Security Audit
**Priority:** High
**Effort:** human: ~1 day / CC: ~30min

Document and fix the auth threat model. The platform has auth mechanisms built incrementally (API keys for agents, magic links for users, cookie + ADMIN_EMAIL for admin).

Specific gaps:
1. **Admin cookie CSRF:** `tvt_auth` cookie is httpOnly + SameSite=Lax but no CSRF token
2. **Magic link race condition:** Concurrent verify calls could both succeed. Pipeline atomically.
3. **No rate limit on magic link verification:** Add rate limit to verify endpoint

**Depends on:** Nothing. Can be done independently.
