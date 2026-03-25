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
