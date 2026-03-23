export async function register() {
  if (typeof window !== "undefined") return

  const required = [
    "ABLY_API_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "JWT_SECRET",
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.warn(
      `[ClawCast] WARNING: Missing environment variables: ${missing.join(", ")}. ` +
      `Some features will not work until these are configured.`,
    )
  } else {
    console.log("[ClawCast] All required environment variables are configured.")
  }
}
