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
  lrange: vi.fn(),
  lpop: vi.fn(),
  llen: vi.fn(),
  rpush: vi.fn(),
  eval: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
  hgetall: vi.fn(),
  hset: vi.fn(),
  hincrby: vi.fn(),
  hget: vi.fn(),
  setnx: vi.fn(),
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
  zrange: vi.fn(),
  zremrangebyrank: vi.fn(),
  sismember: vi.fn(),
}

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
  getRedisSafe: () => mockRedis,
}))

import {
  acquireTransitionLock,
  releaseTransitionLock,
  getActiveSlot,
  setActiveSlot,
  clearActiveSlot,
  pushToQueue,
  popFromQueue,
  getQueue,
  getQueueLength,
  getSlotMeta,
  setSlotMeta,
  incrementFrameCount,
  getFrameCount,
  setLastFrameType,
  getLastFrameType,
  setLastFrameTime,
  getLastFrameTime,
  setBatchMode,
  getBatchMode,
  setBatchSlides,
  getBatchSlides,
  setPendingBatch,
  getPendingBatch,
  deletePendingBatch,
  updatePeakViewers,
  getPeakViewers,
  pushActivity,
  getRecentActivity,
  logDeprecatedFormat,
  saveBroadcastContent,
  getBroadcastContent,
  logValidationError,
  getValidationErrors,
} from "@/lib/kv"

import type { ActiveSlot, QueuedSlot, SlotMeta, BroadcastContentMetadata, ValidationErrorEntry } from "@/lib/types"

beforeEach(() => {
  vi.clearAllMocks()
})

// ══════════════════════════════════════════
// Distributed Lock
// ══════════════════════════════════════════

describe("acquireTransitionLock", () => {
  it("returns true when SET NX succeeds", async () => {
    mockRedis.set.mockResolvedValue("OK")
    const result = await acquireTransitionLock()
    expect(result).toBe(true)
    expect(mockRedis.set).toHaveBeenCalledWith("tvt:transition_lock", "1", { nx: true, ex: 15 })
  })

  it("returns false when SET NX fails (lock held)", async () => {
    mockRedis.set.mockResolvedValue(null)
    const result = await acquireTransitionLock()
    expect(result).toBe(false)
  })
})

describe("releaseTransitionLock", () => {
  it("deletes the lock key", async () => {
    mockRedis.del.mockResolvedValue(1)
    await releaseTransitionLock()
    expect(mockRedis.del).toHaveBeenCalledWith("tvt:transition_lock")
  })
})

// ══════════════════════════════════════════
// Active Slot
// ══════════════════════════════════════════

describe("getActiveSlot", () => {
  it("returns null when no active slot", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getActiveSlot()
    expect(result).toBeNull()
  })

  it("returns the active slot", async () => {
    const slot: ActiveSlot = {
      slot_id: "s1",
      streamer_name: "bot",
      streamer_url: "https://bot.com",
      started_at: new Date().toISOString(),
      slot_end: new Date().toISOString(),
      duration_minutes: 1,
    }
    mockRedis.get.mockResolvedValue(slot)
    const result = await getActiveSlot()
    expect(result).toEqual(slot)
  })
})

describe("setActiveSlot", () => {
  it("stores serialized slot", async () => {
    const slot: ActiveSlot = {
      slot_id: "s1",
      streamer_name: "bot",
      streamer_url: "https://bot.com",
      started_at: new Date().toISOString(),
      slot_end: new Date().toISOString(),
      duration_minutes: 1,
    }
    mockRedis.set.mockResolvedValue("OK")
    await setActiveSlot(slot)
    expect(mockRedis.set).toHaveBeenCalledWith("tvt:active_slot", JSON.stringify(slot))
  })
})

describe("clearActiveSlot", () => {
  it("deletes active slot key", async () => {
    mockRedis.del.mockResolvedValue(1)
    await clearActiveSlot()
    expect(mockRedis.del).toHaveBeenCalledWith("tvt:active_slot")
  })
})

// ══════════════════════════════════════════
// Queue
// ══════════════════════════════════════════

describe("pushToQueue", () => {
  it("rpushes serialized slot to queue", async () => {
    const slot: QueuedSlot = {
      slot_id: "q1",
      streamer_name: "agent",
      streamer_url: "https://agent.com",
      duration_minutes: 1,
    }
    mockRedis.rpush.mockResolvedValue(1)
    await pushToQueue(slot)
    expect(mockRedis.rpush).toHaveBeenCalledWith("tvt:queue", JSON.stringify(slot))
  })
})

describe("popFromQueue", () => {
  it("returns null when queue is empty", async () => {
    mockRedis.lpop.mockResolvedValue(null)
    const result = await popFromQueue()
    expect(result).toBeNull()
  })

  it("returns parsed slot from queue", async () => {
    const slot: QueuedSlot = {
      slot_id: "q1",
      streamer_name: "agent",
      streamer_url: "https://agent.com",
      duration_minutes: 1,
    }
    mockRedis.lpop.mockResolvedValue(JSON.stringify(slot))
    const result = await popFromQueue()
    expect(result).toEqual(slot)
  })
})

describe("getQueue", () => {
  it("returns empty array when queue is empty", async () => {
    mockRedis.lrange.mockResolvedValue([])
    const result = await getQueue()
    expect(result).toEqual([])
  })

  it("returns parsed queue items", async () => {
    const slot1: QueuedSlot = { slot_id: "q1", streamer_name: "a1", streamer_url: "", duration_minutes: 1 }
    const slot2: QueuedSlot = { slot_id: "q2", streamer_name: "a2", streamer_url: "", duration_minutes: 1 }
    mockRedis.lrange.mockResolvedValue([JSON.stringify(slot1), JSON.stringify(slot2)])
    const result = await getQueue()
    expect(result).toHaveLength(2)
    expect(result[0].slot_id).toBe("q1")
    expect(result[1].slot_id).toBe("q2")
  })
})

describe("getQueueLength", () => {
  it("returns the queue length", async () => {
    mockRedis.llen.mockResolvedValue(3)
    const result = await getQueueLength()
    expect(result).toBe(3)
  })
})

// ══════════════════════════════════════════
// Slot Metadata
// ══════════════════════════════════════════

describe("getSlotMeta", () => {
  it("returns null when no meta exists", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getSlotMeta("s1")
    expect(result).toBeNull()
  })

  it("returns slot meta", async () => {
    const meta: SlotMeta = {
      slot_id: "s1",
      streamer_name: "bot",
      created_at: new Date().toISOString(),
      status: "active",
    }
    mockRedis.get.mockResolvedValue(meta)
    const result = await getSlotMeta("s1")
    expect(result?.status).toBe("active")
  })
})

describe("setSlotMeta", () => {
  it("stores meta with 1-hour TTL", async () => {
    const meta: SlotMeta = {
      slot_id: "s1",
      streamer_name: "bot",
      created_at: new Date().toISOString(),
      status: "active",
    }
    mockRedis.set.mockResolvedValue("OK")
    await setSlotMeta("s1", meta)
    expect(mockRedis.set).toHaveBeenCalledWith(
      "tvt:slot:s1",
      JSON.stringify(meta),
      { ex: 3600 }
    )
  })
})

// ══════════════════════════════════════════
// Frame Tracking
// ══════════════════════════════════════════

describe("incrementFrameCount", () => {
  it("increments and sets TTL on first frame", async () => {
    mockRedis.incr.mockResolvedValue(1)
    mockRedis.expire.mockResolvedValue(1)
    const count = await incrementFrameCount("s1")
    expect(count).toBe(1)
    expect(mockRedis.incr).toHaveBeenCalledWith("tvt:frames:s1")
    expect(mockRedis.expire).toHaveBeenCalledWith("tvt:frames:s1", 3600)
  })

  it("does not set TTL on subsequent frames", async () => {
    mockRedis.incr.mockResolvedValue(5)
    const count = await incrementFrameCount("s1")
    expect(count).toBe(5)
    expect(mockRedis.expire).not.toHaveBeenCalled()
  })
})

describe("getFrameCount", () => {
  it("returns 0 when no frames", async () => {
    mockRedis.get.mockResolvedValue(null)
    const count = await getFrameCount("s1")
    expect(count).toBe(0)
  })

  it("returns frame count", async () => {
    mockRedis.get.mockResolvedValue(10)
    const count = await getFrameCount("s1")
    expect(count).toBe(10)
  })
})

describe("setLastFrameType / getLastFrameType", () => {
  it("stores frame type with TTL", async () => {
    mockRedis.set.mockResolvedValue("OK")
    await setLastFrameType("s1", "text")
    expect(mockRedis.set).toHaveBeenCalledWith("tvt:last_type:s1", "text", { ex: 3600 })
  })

  it("returns stored type", async () => {
    mockRedis.get.mockResolvedValue("text")
    const type = await getLastFrameType("s1")
    expect(type).toBe("text")
  })

  it("returns null when not set", async () => {
    mockRedis.get.mockResolvedValue(null)
    const type = await getLastFrameType("s1")
    expect(type).toBeNull()
  })
})

// ══════════════════════════════════════════
// Idle Tracking
// ══════════════════════════════════════════

describe("setLastFrameTime / getLastFrameTime", () => {
  it("stores current timestamp with TTL", async () => {
    mockRedis.set.mockResolvedValue("OK")
    const before = Date.now()
    await setLastFrameTime("s1")
    const call = mockRedis.set.mock.calls[0]
    expect(call[0]).toBe("tvt:last_frame_at:s1")
    expect(call[1]).toBeGreaterThanOrEqual(before)
    expect(call[2]).toEqual({ ex: 3600 })
  })

  it("returns null when not set", async () => {
    mockRedis.get.mockResolvedValue(null)
    const ts = await getLastFrameTime("s1")
    expect(ts).toBeNull()
  })

  it("returns stored timestamp", async () => {
    const ts = Date.now()
    mockRedis.get.mockResolvedValue(ts)
    const result = await getLastFrameTime("s1")
    expect(result).toBe(ts)
  })
})

// ══════════════════════════════════════════
// Batch Mode
// ══════════════════════════════════════════

describe("setBatchMode / getBatchMode", () => {
  it("stores batch end time with TTL", async () => {
    const endAt = new Date().toISOString()
    mockRedis.set.mockResolvedValue("OK")
    await setBatchMode("s1", endAt)
    expect(mockRedis.set).toHaveBeenCalledWith("tvt:batch_end:s1", endAt, { ex: 3600 })
  })

  it("returns batch end time", async () => {
    const endAt = new Date().toISOString()
    mockRedis.get.mockResolvedValue(endAt)
    const result = await getBatchMode("s1")
    expect(result).toBe(endAt)
  })

  it("returns null when not in batch mode", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getBatchMode("s1")
    expect(result).toBeNull()
  })
})

describe("setBatchSlides / getBatchSlides", () => {
  it("stores slides with started_at", async () => {
    const slides = [{ type: "text" }]
    const startedAt = Date.now()
    mockRedis.set.mockResolvedValue("OK")
    await setBatchSlides("s1", slides, startedAt)
    expect(mockRedis.set).toHaveBeenCalledWith(
      "tvt:batch_slides:s1",
      JSON.stringify({ slides, started_at: startedAt }),
      { ex: 3600 }
    )
  })

  it("returns null when no batch slides", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getBatchSlides("s1")
    expect(result).toBeNull()
  })
})

// ══════════════════════════════════════════
// Pending Batch
// ══════════════════════════════════════════

describe("setPendingBatch / getPendingBatch / deletePendingBatch", () => {
  it("stores pending batch with TTL", async () => {
    const slides = [{ type: "text" }]
    mockRedis.set.mockResolvedValue("OK")
    await setPendingBatch("s1", slides)
    expect(mockRedis.set).toHaveBeenCalledWith(
      "tvt:pending_batch:s1",
      JSON.stringify(slides),
      { ex: 3600 }
    )
  })

  it("returns null when no pending batch", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getPendingBatch("s1")
    expect(result).toBeNull()
  })

  it("deletes pending batch", async () => {
    mockRedis.del.mockResolvedValue(1)
    await deletePendingBatch("s1")
    expect(mockRedis.del).toHaveBeenCalledWith("tvt:pending_batch:s1")
  })
})

// ══════════════════════════════════════════
// Peak Viewers (Lua script)
// ══════════════════════════════════════════

describe("updatePeakViewers", () => {
  it("calls Lua eval with correct args", async () => {
    mockRedis.eval.mockResolvedValue(42)
    await updatePeakViewers("s1", 42)
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining("local key = KEYS[1]"),
      ["tvt:peak_viewers:s1"],
      [42, 3600]
    )
  })
})

describe("getPeakViewers", () => {
  it("returns 0 when no data", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getPeakViewers("s1")
    expect(result).toBe(0)
  })

  it("returns stored peak", async () => {
    mockRedis.get.mockResolvedValue(100)
    const result = await getPeakViewers("s1")
    expect(result).toBe(100)
  })
})

// ══════════════════════════════════════════
// Activity Log
// ══════════════════════════════════════════

describe("pushActivity", () => {
  it("lpushes entry and trims to 50", async () => {
    const entry = { name: "bot", text: "went live", timestamp: Date.now() }
    mockRedis.lpush.mockResolvedValue(1)
    mockRedis.ltrim.mockResolvedValue("OK")
    await pushActivity(entry)
    expect(mockRedis.lpush).toHaveBeenCalledWith("tvt:activity", JSON.stringify(entry))
    expect(mockRedis.ltrim).toHaveBeenCalledWith("tvt:activity", 0, 49)
  })
})

describe("getRecentActivity", () => {
  it("returns empty array when no activity", async () => {
    mockRedis.lrange.mockResolvedValue([])
    const result = await getRecentActivity()
    expect(result).toEqual([])
  })

  it("parses activity entries", async () => {
    const entry = { name: "bot", text: "went live", timestamp: 123 }
    mockRedis.lrange.mockResolvedValue([JSON.stringify(entry)])
    const result = await getRecentActivity()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("bot")
  })
})

// ══════════════════════════════════════════
// Deprecated Format Logging
// ══════════════════════════════════════════

describe("logDeprecatedFormat", () => {
  it("increments counter with 7-day TTL", async () => {
    mockRedis.incr.mockResolvedValue(1)
    mockRedis.expire.mockResolvedValue(1)
    await logDeprecatedFormat("bold")
    expect(mockRedis.incr).toHaveBeenCalledWith("tvt:deprecated_format:bold")
    expect(mockRedis.expire).toHaveBeenCalledWith("tvt:deprecated_format:bold", 7 * 24 * 60 * 60)
  })
})

// ══════════════════════════════════════════
// Broadcast Content Metadata
// ══════════════════════════════════════════

describe("saveBroadcastContent / getBroadcastContent", () => {
  it("stores metadata with 7-day TTL", async () => {
    const metadata: BroadcastContentMetadata = {
      slot_id: "s1",
      streamer_name: "bot",
      slides: [],
      format_usage: {},
      theme_usage: {},
      total_duration: 10,
      ended_at: new Date().toISOString(),
    }
    mockRedis.set.mockResolvedValue("OK")
    await saveBroadcastContent("s1", metadata)
    expect(mockRedis.set).toHaveBeenCalledWith(
      "tvt:broadcast_content:s1",
      JSON.stringify(metadata),
      { ex: 7 * 24 * 60 * 60 }
    )
  })

  it("returns null when no content", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getBroadcastContent("s1")
    expect(result).toBeNull()
  })
})

// ══════════════════════════════════════════
// Validation Error Logging
// ══════════════════════════════════════════

describe("logValidationError", () => {
  it("lpushes error and trims to 100", async () => {
    const entry: ValidationErrorEntry = {
      timestamp: Date.now(),
      endpoint: "/api/bookSlot",
      agent_name: "bot",
      error_type: "invalid_slide",
      error_message: "bad type",
    }
    mockRedis.lpush.mockResolvedValue(1)
    mockRedis.ltrim.mockResolvedValue("OK")
    await logValidationError(entry)
    expect(mockRedis.lpush).toHaveBeenCalledWith("tvt:validation_errors", JSON.stringify(entry))
    expect(mockRedis.ltrim).toHaveBeenCalledWith("tvt:validation_errors", 0, 99)
  })

  it("does not throw on Redis error", async () => {
    mockRedis.lpush.mockRejectedValue(new Error("Redis down"))
    const entry: ValidationErrorEntry = {
      timestamp: Date.now(),
      endpoint: "/api/bookSlot",
      agent_name: "bot",
      error_type: "invalid_slide",
      error_message: "bad type",
    }
    // Should not throw
    await logValidationError(entry)
  })
})

describe("getValidationErrors", () => {
  it("returns empty array when no errors", async () => {
    mockRedis.lrange.mockResolvedValue([])
    const result = await getValidationErrors()
    expect(result).toEqual([])
  })

  it("parses error entries", async () => {
    const entry: ValidationErrorEntry = {
      timestamp: 123,
      endpoint: "/api/bookSlot",
      agent_name: "bot",
      error_type: "invalid_slide",
      error_message: "bad",
    }
    mockRedis.lrange.mockResolvedValue([JSON.stringify(entry)])
    const result = await getValidationErrors()
    expect(result).toHaveLength(1)
    expect(result[0].agent_name).toBe("bot")
  })
})
