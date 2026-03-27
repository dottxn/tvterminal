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
  zadd: vi.fn(),
  zrange: vi.fn(),
}

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
  getRedisSafe: () => mockRedis,
}))

import {
  createPost,
  getPost,
  getFeedPosts,
  getAgentPosts,
  pushActivity,
  getRecentActivity,
  logValidationError,
  getValidationErrors,
} from "@/lib/kv"

import type { Post, ValidationErrorEntry } from "@/lib/types"

beforeEach(() => {
  vi.clearAllMocks()
})

// ══════════════════════════════════════════
// Post Storage
// ══════════════════════════════════════════

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post_1234_abcd",
    streamer_name: "test-agent",
    streamer_url: "https://test.com",
    slides: [{ type: "image", content: { image_url: "https://i.imgur.com/abc.png" }, duration_seconds: 8 }],
    frame_size: "square",
    created_at: "2025-01-01T00:00:00.000Z",
    slide_count: 1,
    ...overrides,
  }
}

describe("createPost", () => {
  it("stores post and adds to feed + agent sorted sets", async () => {
    mockRedis.set.mockResolvedValue("OK")
    mockRedis.zadd.mockResolvedValue(1)
    const post = makePost()

    await createPost(post)

    expect(mockRedis.set).toHaveBeenCalledWith(
      "tvt:post:post_1234_abcd",
      JSON.stringify(post)
    )
    expect(mockRedis.zadd).toHaveBeenCalledWith("tvt:feed", {
      score: Date.parse(post.created_at),
      member: post.id,
    })
    expect(mockRedis.zadd).toHaveBeenCalledWith("tvt:agent_posts:test-agent", {
      score: Date.parse(post.created_at),
      member: post.id,
    })
  })
})

describe("getPost", () => {
  it("returns null when no post exists", async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getPost("nonexistent")
    expect(result).toBeNull()
  })

  it("returns parsed post when stored as string", async () => {
    const post = makePost()
    mockRedis.get.mockResolvedValue(JSON.stringify(post))
    const result = await getPost("post_1234_abcd")
    expect(result).toEqual(post)
  })

  it("returns post when Redis auto-parses object", async () => {
    const post = makePost()
    mockRedis.get.mockResolvedValue(post)
    const result = await getPost("post_1234_abcd")
    expect(result).toEqual(post)
  })
})

describe("getFeedPosts", () => {
  it("returns empty array when feed is empty", async () => {
    mockRedis.zrange.mockResolvedValue([])
    const result = await getFeedPosts(20)
    expect(result).toEqual([])
  })

  it("fetches posts by IDs from sorted set", async () => {
    const post = makePost()
    mockRedis.zrange.mockResolvedValue(["post_1234_abcd"])
    mockRedis.get.mockResolvedValue(JSON.stringify(post))

    const result = await getFeedPosts(20)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("post_1234_abcd")
  })

  it("uses before cursor when provided", async () => {
    mockRedis.zrange.mockResolvedValue([])
    await getFeedPosts(20, 1704067200000)
    expect(mockRedis.zrange).toHaveBeenCalledWith(
      "tvt:feed",
      1704067200000 - 1,
      "-inf",
      { byScore: true, rev: true, offset: 0, count: 20 }
    )
  })

  it("uses +inf when no cursor", async () => {
    mockRedis.zrange.mockResolvedValue([])
    await getFeedPosts(10)
    expect(mockRedis.zrange).toHaveBeenCalledWith(
      "tvt:feed",
      "+inf",
      "-inf",
      { byScore: true, rev: true, offset: 0, count: 10 }
    )
  })

  it("skips null posts (deleted/corrupted)", async () => {
    mockRedis.zrange.mockResolvedValue(["post_good", "post_gone"])
    const post = makePost({ id: "post_good" })
    mockRedis.get
      .mockResolvedValueOnce(JSON.stringify(post)) // post_good
      .mockResolvedValueOnce(null) // post_gone

    const result = await getFeedPosts(20)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("post_good")
  })
})

describe("getAgentPosts", () => {
  it("returns empty array when agent has no posts", async () => {
    mockRedis.zrange.mockResolvedValue([])
    const result = await getAgentPosts("test-agent", 20)
    expect(result).toEqual([])
  })

  it("queries agent-specific sorted set", async () => {
    mockRedis.zrange.mockResolvedValue([])
    await getAgentPosts("cool-bot", 10, 1704067200000)
    expect(mockRedis.zrange).toHaveBeenCalledWith(
      "tvt:agent_posts:cool-bot",
      1704067200000 - 1,
      "-inf",
      { byScore: true, rev: true, offset: 0, count: 10 }
    )
  })
})

// ══════════════════════════════════════════
// Activity Log
// ══════════════════════════════════════════

describe("pushActivity", () => {
  it("lpushes entry and trims to 50", async () => {
    const entry = { name: "bot", text: "posted", timestamp: Date.now() }
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
    const entry = { name: "bot", text: "posted", timestamp: 123 }
    mockRedis.lrange.mockResolvedValue([JSON.stringify(entry)])
    const result = await getRecentActivity()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("bot")
  })
})

// ══════════════════════════════════════════
// Validation Error Logging
// ══════════════════════════════════════════

describe("logValidationError", () => {
  it("lpushes error and trims to 100", async () => {
    const entry: ValidationErrorEntry = {
      timestamp: Date.now(),
      endpoint: "/api/createPost",
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
      endpoint: "/api/createPost",
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
      endpoint: "/api/createPost",
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
