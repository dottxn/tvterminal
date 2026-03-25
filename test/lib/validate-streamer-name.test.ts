import { describe, it, expect } from "vitest"
import { validateStreamerName } from "@/lib/types"

describe("validateStreamerName", () => {
  // ── Valid inputs ──

  it("accepts simple alphanumeric name", () => {
    expect(validateStreamerName("agent1")).toBeNull()
  })

  it("accepts name with dots", () => {
    expect(validateStreamerName("my.agent")).toBeNull()
  })

  it("accepts name with dashes", () => {
    expect(validateStreamerName("my-agent")).toBeNull()
  })

  it("accepts name with underscores", () => {
    expect(validateStreamerName("my_agent")).toBeNull()
  })

  it("accepts single character name", () => {
    expect(validateStreamerName("a")).toBeNull()
  })

  it("accepts 50 character name (max length)", () => {
    expect(validateStreamerName("a".repeat(50))).toBeNull()
  })

  it("accepts mixed valid characters", () => {
    expect(validateStreamerName("Agent_v2.0-beta")).toBeNull()
  })

  // ── Invalid inputs ──

  it("rejects null", () => {
    expect(validateStreamerName(null)).not.toBeNull()
  })

  it("rejects undefined", () => {
    expect(validateStreamerName(undefined)).not.toBeNull()
  })

  it("rejects empty string", () => {
    expect(validateStreamerName("")).not.toBeNull()
  })

  it("rejects non-string (number)", () => {
    expect(validateStreamerName(42)).not.toBeNull()
  })

  it("rejects non-string (boolean)", () => {
    expect(validateStreamerName(true)).not.toBeNull()
  })

  it("rejects 51 character name (over max)", () => {
    expect(validateStreamerName("a".repeat(51))).not.toBeNull()
  })

  it("rejects name with spaces", () => {
    expect(validateStreamerName("my agent")).not.toBeNull()
  })

  it("rejects name with special characters", () => {
    expect(validateStreamerName("agent@home")).not.toBeNull()
    expect(validateStreamerName("agent!")).not.toBeNull()
    expect(validateStreamerName("agent#1")).not.toBeNull()
  })

  it("rejects name with unicode", () => {
    expect(validateStreamerName("agentéèê")).not.toBeNull()
  })

  it("rejects name with slashes", () => {
    expect(validateStreamerName("agent/foo")).not.toBeNull()
    expect(validateStreamerName("agent\\foo")).not.toBeNull()
  })

  // ── Error message format ──

  it("returns specific error for missing input", () => {
    expect(validateStreamerName(null)).toBe("streamer_name required (string)")
  })

  it("returns specific error for invalid pattern", () => {
    expect(validateStreamerName("bad name!")).toBe(
      "streamer_name must be 1-50 chars: letters, numbers, underscore, dot, hyphen",
    )
  })
})
