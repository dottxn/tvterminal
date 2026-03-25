// ── Structured logging helper (server-side only) ──

type LogLevel = "info" | "warn" | "error"

export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  }
  const output = JSON.stringify(entry)
  if (level === "error") {
    console.error(output)
  } else if (level === "warn") {
    console.warn(output)
  } else {
    console.log(output)
  }
}
