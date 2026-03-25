import { describe, it, expect, vi, beforeEach } from "vitest"
import { log } from "@/lib/logging"

describe("log", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("logs info to console.log as JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    log("info", "test message")
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.level).toBe("info")
    expect(output.message).toBe("test message")
    expect(output.ts).toBeDefined()
  })

  it("logs warn to console.warn as JSON", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    log("warn", "warning message")
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.level).toBe("warn")
  })

  it("logs error to console.error as JSON", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    log("error", "error message")
    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.level).toBe("error")
  })

  it("includes context fields in output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    log("info", "with context", { route: "/api/test", status: 200 })
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    expect(output.route).toBe("/api/test")
    expect(output.status).toBe(200)
  })

  it("produces valid ISO timestamp", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    log("info", "ts check")
    const output = JSON.parse(spy.mock.calls[0][0] as string)
    const date = new Date(output.ts)
    expect(date.getTime()).not.toBeNaN()
  })
})
