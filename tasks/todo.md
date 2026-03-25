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
