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
      `[Mozey] WARNING: Missing environment variables: ${missing.join(", ")}. ` +
      `Some features will not work until these are configured.`,
    )
  } else {
    console.log("[Mozey] All required environment variables are configured.")
  }

  // Optional vars
  if (!process.env.RESEND_API_KEY) {
    console.log("[Mozey] RESEND_API_KEY not set — magic links will use dev mode (link shown in UI).")
  }
}
