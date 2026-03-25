import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Redis ──
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  lpush: vi.fn(),
  ltrim: vi.fn(),
  eval: vi.fn(),
  hgetall: vi.fn(),
  hset: vi.fn(),
  hincrby: vi.fn(),
  hget: vi.fn(),
  pipeline: vi.fn(() => ({
    get: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    hincrby: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zremrangebyrank: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
  zadd: vi.fn(),
  zremrangebyrank: vi.fn(),
  sadd: vi.fn(),
}

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
  getRedisSafe: () => mockRedis,
}))

// ── Mock Ably ──
vi.mock("@/lib/ably-server", () => ({
  publishToLive: vi.fn().mockResolvedValue(undefined),
  publishToChat: vi.fn().mockResolvedValue(undefined),
  getViewerCount: vi.fn().mockResolvedValue(0),
}))

import { checkAndTransitionSlots, endSlot, promoteNextSlot } from "@/lib/slot-lifecycle"
import * as kv from "@/lib/kv"
import * as kvAuth from "@/lib/kv-auth"
import * as kvPoll from "@/lib/kv-poll"
import { publishToLive } from "@/lib/ably-server"
import type { ActiveSlot, QueuedSlot, SlotMeta } from "@/lib/types"

// ── Spy on kv modules so we can control return values ──
vi.mock("@/lib/kv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kv")>()
  return {
    ...actual,
    acquireTransitionLock: vi.fn(),
    releaseTransitionLock: vi.fn(),
    getActiveSlot: vi.fn(),
    clearActiveSlot: vi.fn(),
    popFromQueue: vi.fn(),
    setActiveSlot: vi.fn(),
    getSlotMeta: vi.fn(),
    setSlotMeta: vi.fn(),
    getFrameCount: vi.fn(),
    getLastFrameTime: vi.fn(),
    getBatchMode: vi.fn(),
    setBatchMode: vi.fn(),
    setBatchSlides: vi.fn(),
    incrementFrameCount: vi.fn(),
    setLastFrameType: vi.fn(),
    setLastFrameTime: vi.fn(),
    getPendingBatch: vi.fn(),
    deletePendingBatch: vi.fn(),
    pushActivity: vi.fn(),
    getPeakViewers: vi.fn(),
    getBatchSlides: vi.fn(),
    saveBroadcastContent: vi.fn(),
  }
})

vi.mock("@/lib/kv-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kv-auth")>()
  return {
    ...actual,
    getAgentOwner: vi.fn(),
    updateAgentStreamStats: vi.fn(),
    addBroadcastHistory: vi.fn(),
  }
})

vi.mock("@/lib/kv-poll", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kv-poll")>()
  return {
    ...actual,
    getSlotTotalVotes: vi.fn(),
    setActivePoll: vi.fn(),
  }
})

// ── Helpers ──

function makeActiveSlot(overrides: Partial<ActiveSlot> = {}): ActiveSlot {
  const now = new Date()
  return {
    slot_id: "slot_test_1",
    streamer_name: "test-agent",
    streamer_url: "https://test.com",
    started_at: new Date(now.getTime() - 10_000).toISOString(), // 10s ago
    slot_end: new Date(now.getTime() + 50_000).toISOString(), // 50s from now
    duration_minutes: 1,
    ...overrides,
  }
}

function makeQueuedSlot(overrides: Partial<QueuedSlot> = {}): QueuedSlot {
  return {
    slot_id: "slot_queued_1",
    streamer_name: "queued-agent",
    streamer_url: "https://queued.com",
    duration_minutes: 1,
    ...overrides,
  }
}

function makeMeta(overrides: Partial<SlotMeta> = {}): SlotMeta {
  return {
    slot_id: "slot_test_1",
    streamer_name: "test-agent",
    created_at: new Date().toISOString(),
    status: "active",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset Ably mock (clearAllMocks wipes implementations)
  vi.mocked(publishToLive).mockResolvedValue(undefined)
  // Default: lock succeeds, no active slot, empty queue
  vi.mocked(kv.acquireTransitionLock).mockResolvedValue(true)
  vi.mocked(kv.releaseTransitionLock).mockResolvedValue(undefined)
  vi.mocked(kv.getActiveSlot).mockResolvedValue(null)
  vi.mocked(kv.popFromQueue).mockResolvedValue(null)
  vi.mocked(kv.clearActiveSlot).mockResolvedValue(undefined)
  vi.mocked(kv.setActiveSlot).mockResolvedValue(undefined)
  vi.mocked(kv.setSlotMeta).mockResolvedValue(undefined)
  vi.mocked(kv.pushActivity).mockResolvedValue(undefined)
  vi.mocked(kv.setBatchMode).mockResolvedValue(undefined)
  vi.mocked(kv.setBatchSlides).mockResolvedValue(undefined)
  vi.mocked(kv.incrementFrameCount).mockResolvedValue(1)
  vi.mocked(kv.setLastFrameType).mockResolvedValue(undefined)
  vi.mocked(kv.setLastFrameTime).mockResolvedValue(undefined)
  vi.mocked(kv.deletePendingBatch).mockResolvedValue(undefined)
  vi.mocked(kv.saveBroadcastContent).mockResolvedValue(undefined)
  vi.mocked(kv.getPeakViewers).mockResolvedValue(0)
  vi.mocked(kv.getBatchSlides).mockResolvedValue(null)
  vi.mocked(kvAuth.getAgentOwner).mockResolvedValue(null)
  vi.mocked(kvAuth.updateAgentStreamStats).mockResolvedValue(undefined)
  vi.mocked(kvAuth.addBroadcastHistory).mockResolvedValue(undefined)
  vi.mocked(kvPoll.getSlotTotalVotes).mockResolvedValue(0)
  vi.mocked(kvPoll.setActivePoll).mockResolvedValue(undefined)
})

// ══════════════════════════════════════════
// checkAndTransitionSlots
// ══════════════════════════════════════════

describe("checkAndTransitionSlots", () => {
  it("bails when lock is not acquired", async () => {
    vi.mocked(kv.acquireTransitionLock).mockResolvedValue(false)
    await checkAndTransitionSlots()
    expect(kv.getActiveSlot).not.toHaveBeenCalled()
    expect(kv.releaseTransitionLock).not.toHaveBeenCalled()
  })

  it("always releases lock even on success", async () => {
    await checkAndTransitionSlots()
    expect(kv.releaseTransitionLock).toHaveBeenCalledOnce()
  })

  it("promotes next slot when no active slot exists", async () => {
    vi.mocked(kv.getActiveSlot).mockResolvedValue(null)
    vi.mocked(kv.popFromQueue).mockResolvedValue(null)
    await checkAndTransitionSlots()
    expect(kv.popFromQueue).toHaveBeenCalledOnce()
    expect(kv.clearActiveSlot).toHaveBeenCalled()
  })

  it("skips slot that started less than 2s ago (race guard)", async () => {
    const justStarted = makeActiveSlot({
      started_at: new Date(Date.now() - 500).toISOString(), // 500ms ago
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(justStarted)
    await checkAndTransitionSlots()
    // Should not end the slot or check batch/idle
    expect(kv.getBatchMode).not.toHaveBeenCalled()
    expect(kv.getFrameCount).not.toHaveBeenCalled()
  })

  it("ends an expired slot and promotes next", async () => {
    const expired = makeActiveSlot({
      started_at: new Date(Date.now() - 120_000).toISOString(),
      slot_end: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(expired)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta())
    vi.mocked(kv.popFromQueue).mockResolvedValue(null)

    await checkAndTransitionSlots()
    // endSlot should have been called (sets meta to completed)
    expect(kv.setSlotMeta).toHaveBeenCalled()
    expect(publishToLive).toHaveBeenCalledWith("slot_end", { streamer_name: "test-agent" })
  })

  it("ends slot when batch is complete (+ 500ms buffer)", async () => {
    const active = makeActiveSlot({
      started_at: new Date(Date.now() - 30_000).toISOString(),
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(active)
    // Batch ended 600ms ago (past the 500ms buffer)
    vi.mocked(kv.getBatchMode).mockResolvedValue(
      new Date(Date.now() - 600).toISOString()
    )
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta())
    vi.mocked(kv.popFromQueue).mockResolvedValue(null)

    await checkAndTransitionSlots()
    expect(kv.setSlotMeta).toHaveBeenCalled()
    expect(publishToLive).toHaveBeenCalledWith("slot_end", { streamer_name: "test-agent" })
  })

  it("skips idle check while batch is still playing", async () => {
    const active = makeActiveSlot({
      started_at: new Date(Date.now() - 30_000).toISOString(),
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(active)
    // Batch ends 10s from now
    vi.mocked(kv.getBatchMode).mockResolvedValue(
      new Date(Date.now() + 10_000).toISOString()
    )

    await checkAndTransitionSlots()
    // Should NOT check frame count
    expect(kv.getFrameCount).not.toHaveBeenCalled()
  })

  it("cuts idle slot with zero frames after 30s", async () => {
    const idle = makeActiveSlot({
      started_at: new Date(Date.now() - 35_000).toISOString(), // 35s ago
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(idle)
    vi.mocked(kv.getBatchMode).mockResolvedValue(null)
    vi.mocked(kv.getFrameCount).mockResolvedValue(0)
    vi.mocked(kv.getLastFrameTime).mockResolvedValue(null)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta())
    vi.mocked(kv.popFromQueue).mockResolvedValue(null)

    await checkAndTransitionSlots()
    expect(publishToLive).toHaveBeenCalledWith("slot_end", { streamer_name: "test-agent" })
  })

  it("does NOT cut slot with zero frames within 30s window", async () => {
    const fresh = makeActiveSlot({
      started_at: new Date(Date.now() - 15_000).toISOString(), // 15s ago
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(fresh)
    vi.mocked(kv.getBatchMode).mockResolvedValue(null)
    vi.mocked(kv.getFrameCount).mockResolvedValue(0)
    vi.mocked(kv.getLastFrameTime).mockResolvedValue(null)

    await checkAndTransitionSlots()
    expect(publishToLive).not.toHaveBeenCalled()
  })

  it("cuts slot when frames stopped for 30s+", async () => {
    const active = makeActiveSlot({
      started_at: new Date(Date.now() - 60_000).toISOString(),
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(active)
    vi.mocked(kv.getBatchMode).mockResolvedValue(null)
    vi.mocked(kv.getFrameCount).mockResolvedValue(5)
    vi.mocked(kv.getLastFrameTime).mockResolvedValue(Date.now() - 35_000) // 35s ago
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta())
    vi.mocked(kv.popFromQueue).mockResolvedValue(null)

    await checkAndTransitionSlots()
    expect(publishToLive).toHaveBeenCalledWith("slot_end", { streamer_name: "test-agent" })
  })

  it("keeps slot alive when frames are recent", async () => {
    const active = makeActiveSlot({
      started_at: new Date(Date.now() - 60_000).toISOString(),
    })
    vi.mocked(kv.getActiveSlot).mockResolvedValue(active)
    vi.mocked(kv.getBatchMode).mockResolvedValue(null)
    vi.mocked(kv.getFrameCount).mockResolvedValue(5)
    vi.mocked(kv.getLastFrameTime).mockResolvedValue(Date.now() - 5_000) // 5s ago

    await checkAndTransitionSlots()
    expect(publishToLive).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════
// endSlot
// ══════════════════════════════════════════

describe("endSlot", () => {
  it("skips already-completed slots (idempotency guard)", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "completed" }))

    await endSlot(slot)
    // Should NOT publish slot_end or push activity
    expect(publishToLive).not.toHaveBeenCalled()
    expect(kv.pushActivity).not.toHaveBeenCalled()
  })

  it("marks slot as completed BEFORE publishing events", async () => {
    const slot = makeActiveSlot()
    const meta = makeMeta({ status: "active" })
    vi.mocked(kv.getSlotMeta).mockResolvedValue(meta)

    const callOrder: string[] = []
    vi.mocked(kv.setSlotMeta).mockImplementation(async () => { callOrder.push("setMeta") })
    vi.mocked(publishToLive).mockImplementation(async () => { callOrder.push("publish") })

    await endSlot(slot)
    expect(callOrder[0]).toBe("setMeta")
    expect(callOrder[1]).toBe("publish")
  })

  it("publishes slot_end event with streamer_name", async () => {
    const slot = makeActiveSlot({ streamer_name: "cool-bot" })
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "active" }))

    await endSlot(slot)
    expect(publishToLive).toHaveBeenCalledWith("slot_end", { streamer_name: "cool-bot" })
  })

  it("pushes activity entry on end", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "active" }))

    await endSlot(slot)
    expect(kv.pushActivity).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-agent", text: "finished broadcasting" })
    )
  })

  it("saves broadcast content metadata when batch slides exist", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "active" }))
    vi.mocked(kv.getBatchSlides).mockResolvedValue({
      slides: [
        { type: "text", content: { body: "hello", headline: "Hi" }, duration_seconds: 5 },
        { type: "text", content: { theme: "mono", body: "$ ls" }, duration_seconds: 3 },
      ],
      started_at: Date.now() - 8000,
    })

    await endSlot(slot)
    expect(kv.saveBroadcastContent).toHaveBeenCalledWith(
      "slot_test_1",
      expect.objectContaining({
        slot_id: "slot_test_1",
        streamer_name: "test-agent",
        slides: expect.arrayContaining([
          expect.objectContaining({ type: "text" }),
          expect.objectContaining({ type: "text" }),
        ]),
      })
    )
  })

  it("collects stats for owned agents", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "active" }))
    vi.mocked(kvAuth.getAgentOwner).mockResolvedValue("owner@test.com")
    vi.mocked(kv.getPeakViewers).mockResolvedValue(42)
    vi.mocked(kvPoll.getSlotTotalVotes).mockResolvedValue(10)
    vi.mocked(kv.getFrameCount).mockResolvedValue(5)

    await endSlot(slot)
    expect(kvAuth.updateAgentStreamStats).toHaveBeenCalledWith("test-agent", 42, 10)
    expect(kvAuth.addBroadcastHistory).toHaveBeenCalledWith(
      "test-agent",
      expect.objectContaining({
        slot_id: "slot_test_1",
        slide_count: 5,
        peak_viewers: 42,
        total_votes: 10,
      })
    )
  })

  it("skips stats collection for unclaimed agents", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "active" }))
    vi.mocked(kvAuth.getAgentOwner).mockResolvedValue(null)

    await endSlot(slot)
    expect(kvAuth.updateAgentStreamStats).not.toHaveBeenCalled()
  })

  it("handles Ably publish failure gracefully", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ status: "active" }))
    vi.mocked(publishToLive).mockRejectedValue(new Error("Ably down"))

    // Should not throw
    await endSlot(slot)
    // Meta should still have been marked as completed
    expect(kv.setSlotMeta).toHaveBeenCalledWith(
      "slot_test_1",
      expect.objectContaining({ status: "completed" })
    )
  })

  it("handles null meta gracefully", async () => {
    const slot = makeActiveSlot()
    vi.mocked(kv.getSlotMeta).mockResolvedValue(null)

    // Should not throw, should still publish events
    await endSlot(slot)
    expect(publishToLive).toHaveBeenCalledWith("slot_end", { streamer_name: "test-agent" })
  })
})

// ══════════════════════════════════════════
// promoteNextSlot
// ══════════════════════════════════════════

describe("promoteNextSlot", () => {
  it("clears active slot when queue is empty", async () => {
    vi.mocked(kv.popFromQueue).mockResolvedValue(null)
    await promoteNextSlot()
    expect(kv.clearActiveSlot).toHaveBeenCalledOnce()
    expect(kv.setActiveSlot).not.toHaveBeenCalled()
  })

  it("sets the next queued slot as active", async () => {
    const queued = makeQueuedSlot()
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(null)

    await promoteNextSlot()
    expect(kv.setActiveSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        slot_id: "slot_queued_1",
        streamer_name: "queued-agent",
      })
    )
  })

  it("publishes slot_start event on promotion", async () => {
    const queued = makeQueuedSlot()
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(null)

    await promoteNextSlot()
    expect(publishToLive).toHaveBeenCalledWith("slot_start", expect.objectContaining({
      streamer_name: "queued-agent",
    }))
  })

  it("pushes 'went live' activity on promotion", async () => {
    const queued = makeQueuedSlot()
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(null)

    await promoteNextSlot()
    expect(kv.pushActivity).toHaveBeenCalledWith(
      expect.objectContaining({ name: "queued-agent", text: "went live" })
    )
  })

  it("auto-plays pending batch slides", async () => {
    const queued = makeQueuedSlot()
    const pendingSlides = [
      { type: "text", content: { body: "Hello!" }, duration_seconds: 5 },
      { type: "text", content: { theme: "mono", body: "$ echo hi" }, duration_seconds: 3 },
    ]
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(pendingSlides)

    await promoteNextSlot()

    // Should set batch mode + slides
    expect(kv.setBatchMode).toHaveBeenCalled()
    expect(kv.setBatchSlides).toHaveBeenCalled()
    // Should publish batch event
    expect(publishToLive).toHaveBeenCalledWith("batch", expect.objectContaining({
      slides: expect.arrayContaining([expect.objectContaining({ type: "text" })]),
      total_duration_seconds: 8,
      slide_count: 2,
    }))
    // Should clean up pending batch
    expect(kv.deletePendingBatch).toHaveBeenCalledWith("slot_queued_1")
    // Should track frame activity
    expect(kv.incrementFrameCount).toHaveBeenCalledWith("slot_queued_1")
    expect(kv.setLastFrameType).toHaveBeenCalledWith("slot_queued_1", "text")
    expect(kv.setLastFrameTime).toHaveBeenCalledWith("slot_queued_1")
  })

  it("injects poll_id into poll slides and sets active poll", async () => {
    const queued = makeQueuedSlot()
    const pendingSlides = [
      {
        type: "poll",
        content: { question: "Best color?", options: ["Red", "Blue"] },
        duration_seconds: 10,
      },
    ]
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(pendingSlides)

    await promoteNextSlot()

    // poll_id should have been injected
    expect(kvPoll.setActivePoll).toHaveBeenCalledWith(
      "slot_queued_1",
      expect.objectContaining({
        slot_id: "slot_queued_1",
        question: "Best color?",
        options: ["Red", "Blue"],
        option_count: 2,
      })
    )
  })

  it("sets initial frame time for non-batch agents", async () => {
    const queued = makeQueuedSlot()
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(null)

    await promoteNextSlot()
    expect(kv.setLastFrameTime).toHaveBeenCalledWith("slot_queued_1")
  })

  it("shortens slot_end to match batch duration", async () => {
    const queued = makeQueuedSlot()
    const pendingSlides = [
      { type: "text", content: { body: "Quick!" }, duration_seconds: 3 },
    ]
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(pendingSlides)

    await promoteNextSlot()

    // setActiveSlot should be called twice: initial + shortened
    expect(kv.setActiveSlot).toHaveBeenCalledTimes(2)
  })

  it("updates meta status to active", async () => {
    const queued = makeQueuedSlot()
    vi.mocked(kv.popFromQueue).mockResolvedValue(queued)
    vi.mocked(kv.getSlotMeta).mockResolvedValue(makeMeta({ slot_id: "slot_queued_1", status: "queued" }))
    vi.mocked(kv.getPendingBatch).mockResolvedValue(null)

    await promoteNextSlot()
    expect(kv.setSlotMeta).toHaveBeenCalledWith(
      "slot_queued_1",
      expect.objectContaining({ status: "active" })
    )
  })
})
