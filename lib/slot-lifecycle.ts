import { getActiveSlot, clearActiveSlot, popFromQueue, setActiveSlot, setSlotMeta, getSlotMeta, getLastFrameTime, getFrameCount, getBatchMode, setBatchMode, setBatchSlides, incrementFrameCount, setLastFrameType, setLastFrameTime, getPendingBatch, deletePendingBatch, acquireTransitionLock, releaseTransitionLock, pushActivity, getPeakViewers, getBatchSlides, saveBroadcastContent } from "./kv"
import { publishToLive } from "./ably-server"
import type { ActiveSlot, ValidatedSlide, BroadcastContentMetadata, SlideMetadata } from "./types"
import { getAgentOwner, updateAgentStreamStats, addBroadcastHistory } from "./kv-auth"
import { getSlotTotalVotes, setActivePoll } from "./kv-poll"

/** Extract structural metadata from batch slides (no full content stored). */
function extractContentMetadata(slides: ValidatedSlide[], slotId: string, streamerName: string): BroadcastContentMetadata {
  const formatUsage: Record<string, number> = {}
  const themeUsage: Record<string, number> = {}
  let totalDuration = 0

  const slideMetadata: SlideMetadata[] = slides.map(slide => {
    const content = slide.content as Record<string, unknown>
    formatUsage[slide.type] = (formatUsage[slide.type] ?? 0) + 1
    totalDuration += slide.duration_seconds

    const meta: SlideMetadata = { type: slide.type, duration: slide.duration_seconds }

    if (slide.type === "text") {
      const theme = (content.theme as string) ?? "minimal"
      themeUsage[theme] = (themeUsage[theme] ?? 0) + 1
      meta.theme = theme
      const body = (content.body as string) ?? ""
      const headline = (content.headline as string) ?? ""
      meta.char_count = headline.length + body.length
    }
    if (slide.type === "data") {
      meta.row_count = Array.isArray(content.rows) ? content.rows.length : 0
    }
    if (slide.type === "poll") {
      meta.option_count = Array.isArray(content.options) ? content.options.length : 0
    }
    if (slide.type === "build") {
      meta.step_count = Array.isArray(content.steps) ? content.steps.length : 0
    }
    if (slide.type === "image" && typeof content.image_url === "string") {
      try { meta.image_domain = new URL(content.image_url).hostname } catch { /* skip */ }
    }
    if (slide.type === "roast") {
      const response = (content.response as string) ?? ""
      const targetQuote = (content.target_quote as string) ?? ""
      meta.char_count = response.length + targetQuote.length
    }
    if (slide.type === "thread") {
      const entries = Array.isArray(content.entries) ? content.entries : []
      meta.row_count = entries.length
      meta.char_count = entries.reduce((sum: number, e: unknown) => {
        const text = (e as Record<string, unknown>)?.text
        return sum + (typeof text === "string" ? text.length : 0)
      }, 0)
    }

    return meta
  })

  return {
    slot_id: slotId,
    streamer_name: streamerName,
    slides: slideMetadata,
    format_usage: formatUsage,
    theme_usage: themeUsage,
    total_duration: totalDuration,
    ended_at: new Date().toISOString(),
  }
}

// Cut off agents who book a slot but don't broadcast anything
// 30s gives queued agents enough time to discover they've been promoted
const IDLE_TIMEOUT_MS = 30_000

/**
 * Check if the active slot has expired, gone idle, or finished a batch.
 * Called by every API route (check-on-access) and the cron job.
 */
export async function checkAndTransitionSlots(): Promise<void> {
  // Acquire distributed lock to prevent concurrent transitions
  // (parallel API calls could race and skip agents)
  const locked = await acquireTransitionLock()
  if (!locked) return // Another call is handling transitions

  try {
    const active = await getActiveSlot()

    if (active) {
      const now = Date.now()
      const slotEnd = Date.parse(active.slot_end)
      const startedAt = Date.parse(active.started_at)

      // Safety: never end a slot that started less than 2s ago
      // This prevents race conditions where a just-promoted slot gets immediately ended
      if (now - startedAt < 2000) {
        return
      }

      if (now >= slotEnd) {
        // Slot has expired — end it and promote next
        console.log(`[slot-lifecycle] Slot expired for ${active.slot_id} (${active.streamer_name}) — ending`)
        await endSlot(active)
        await promoteNextSlot()
        return
      }

      // Check if a batch finished playing
      const batchEndAt = await getBatchMode(active.slot_id)
      if (batchEndAt) {
        const batchEnd = Date.parse(batchEndAt)
        if (now >= batchEnd + 500) {
          // Batch complete + 500ms buffer — end slot
          console.log(`[slot-lifecycle] Batch complete for ${active.slot_id} (${active.streamer_name}) — ending slot`)
          await endSlot(active)
          await promoteNextSlot()
          return
        }
        // Batch still playing — skip idle check
        if (now < batchEnd) {
          return
        }
      }

      // Check for idle slots — no frames pushed for too long
      const frameCount = await getFrameCount(active.slot_id)
      const lastFrameAt = await getLastFrameTime(active.slot_id)

      if (frameCount === 0 && now - startedAt > IDLE_TIMEOUT_MS) {
        // Never pushed a single frame — cut them off
        console.log(`[slot-lifecycle] Cutting idle slot ${active.slot_id} (${active.streamer_name}) — no frames after ${Math.round((now - startedAt) / 1000)}s`)
        await endSlot(active)
        await promoteNextSlot()
      } else if (lastFrameAt && now - lastFrameAt > IDLE_TIMEOUT_MS) {
        // Stopped pushing frames — cut them off
        console.log(`[slot-lifecycle] Cutting idle slot ${active.slot_id} (${active.streamer_name}) — no frames for ${Math.round((now - lastFrameAt) / 1000)}s`)
        await endSlot(active)
        await promoteNextSlot()
      }
    } else {
      // No active slot — check if there's something in the queue
      await promoteNextSlot()
    }
  } finally {
    await releaseTransitionLock()
  }
}

/**
 * End the current active slot — publish slot_end, clean up KV, update meta.
 * Does NOT clear the active slot — that's done by promoteNextSlot (which
 * replaces it atomically) or by the caller if no next slot exists.
 */
export async function endSlot(slot: ActiveSlot): Promise<void> {
  // ── Idempotency guard ──
  // If the slot is already ended (status=completed), bail immediately.
  // Prevents double-counting stats, duplicate Ably events, and queue corruption
  // from Vercel retries or lock expiry races.
  const meta = await getSlotMeta(slot.slot_id)
  if (meta?.status === "completed") {
    console.log(`[slot-lifecycle] endSlot called for already-completed slot ${slot.slot_id} — skipping`)
    return
  }

  // Mark as completed FIRST (before side effects) so retries bail
  if (meta) {
    meta.status = "completed"
    await setSlotMeta(slot.slot_id, meta)
  }

  try {
    await publishToLive("slot_end", { streamer_name: slot.streamer_name })
    await pushActivity({ name: slot.streamer_name, text: "finished broadcasting", timestamp: Date.now() })
  } catch (err) {
    console.error("[slot-lifecycle] Failed to publish slot_end:", err)
  }

  // Capture broadcast content metadata for ALL agents (not just owned)
  try {
    const batchData = await getBatchSlides(slot.slot_id)
    if (batchData?.slides && Array.isArray(batchData.slides) && batchData.slides.length > 0) {
      const metadata = extractContentMetadata(batchData.slides as ValidatedSlide[], slot.slot_id, slot.streamer_name)
      await saveBroadcastContent(slot.slot_id, metadata)
    }
  } catch (err) {
    console.error("[slot-lifecycle] Failed to save broadcast content metadata:", err)
  }

  // Collect post-stream stats for owned agents + write broadcast history
  try {
    const owner = await getAgentOwner(slot.streamer_name)
    if (owner) {
      const [peakViewers, totalVotes, frameCount] = await Promise.all([
        getPeakViewers(slot.slot_id),
        getSlotTotalVotes(slot.slot_id),
        getFrameCount(slot.slot_id),
      ])
      await Promise.all([
        updateAgentStreamStats(slot.streamer_name, peakViewers, totalVotes),
        addBroadcastHistory(slot.streamer_name, {
          slot_id: slot.slot_id,
          start_time: slot.started_at,
          end_time: new Date().toISOString(),
          slide_count: frameCount,
          peak_viewers: peakViewers,
          total_votes: totalVotes,
        }),
      ])
    }
  } catch (err) {
    console.error("[slot-lifecycle] Failed to update stream stats:", err)
  }
}

/**
 * Promote the next queued slot to active.
 * If the slot has a pending batch (slides submitted at booking), auto-play it.
 */
export async function promoteNextSlot(): Promise<void> {
  const next = await popFromQueue()
  if (!next) {
    // No next agent — clear active slot
    await clearActiveSlot()
    return
  }

  const now = new Date()
  const slotEnd = new Date(now.getTime() + next.duration_minutes * 60 * 1000)

  const active: ActiveSlot = {
    slot_id: next.slot_id,
    streamer_name: next.streamer_name,
    streamer_url: next.streamer_url,
    started_at: now.toISOString(),
    slot_end: slotEnd.toISOString(),
    duration_minutes: next.duration_minutes,
  }

  await setActiveSlot(active)

  // Update slot meta
  const meta = await getSlotMeta(next.slot_id)
  if (meta) {
    meta.status = "active"
    await setSlotMeta(next.slot_id, meta)
  }

  // Publish slot_start
  try {
    await publishToLive("slot_start", {
      streamer_name: active.streamer_name,
      streamer_url: active.streamer_url,
      slot_end: active.slot_end,
      type: "text",
    })
    await pushActivity({ name: active.streamer_name, text: "went live", timestamp: Date.now() })
  } catch (err) {
    console.error("[slot-lifecycle] Failed to publish slot_start:", err)
  }

  // Check for pending batch (slides submitted at booking time)
  const pendingSlides = await getPendingBatch(next.slot_id)
  if (pendingSlides && Array.isArray(pendingSlides) && pendingSlides.length > 0) {
    const slides = pendingSlides as ValidatedSlide[]
    const batchNow = Date.now()
    const totalDuration = slides.reduce((sum, s) => sum + s.duration_seconds, 0)
    const batchEndAt = new Date(batchNow + totalDuration * 1000)
    const newSlotEnd = new Date(batchEndAt.getTime() + 500)

    // Shorten slot to match batch duration
    if (newSlotEnd.getTime() < Date.parse(active.slot_end)) {
      active.slot_end = newSlotEnd.toISOString()
      await setActiveSlot(active)
    }

    // Inject server-generated poll_id into any poll slides
    for (const slide of slides) {
      if (slide.type === "poll") {
        const c = slide.content as Record<string, unknown>
        const pollId = `poll_${next.slot_id}_${Date.now()}`
        c.poll_id = pollId
        const opts = c.options as string[]
        await setActivePoll(next.slot_id, {
          poll_id: pollId,
          slot_id: next.slot_id,
          question: c.question as string,
          options: opts,
          option_count: opts.length,
          created_at: Date.now(),
        })
      }
    }

    // Set batch mode
    await setBatchMode(next.slot_id, batchEndAt.toISOString())
    await setBatchSlides(next.slot_id, slides, batchNow)

    // Track frame activity (prevents idle timeout)
    await incrementFrameCount(next.slot_id)
    await setLastFrameType(next.slot_id, slides[0].type)
    await setLastFrameTime(next.slot_id)

    // Publish batch event to Ably
    try {
      await publishToLive("batch", {
        slides,
        total_duration_seconds: totalDuration,
        slide_count: slides.length,
      })
    } catch (err) {
      console.error("[slot-lifecycle] Failed to publish pending batch:", err)
    }

    // Clean up pending batch
    await deletePendingBatch(next.slot_id)

    console.log(`[slot-lifecycle] Auto-played pending batch for ${next.streamer_name}: ${slides.length} slides, ${totalDuration}s`)
  } else {
    // No pending batch — this is a real-time/duet agent
    // Set initial frame time so the idle check gives them the full 30s window
    // (The idle check uses `started_at` for frameCount === 0 and `lastFrameAt` for frameCount > 0)
    await setLastFrameTime(next.slot_id)
    console.log(`[slot-lifecycle] Promoted ${next.streamer_name} (no pending batch — awaiting content)`)
  }
}
