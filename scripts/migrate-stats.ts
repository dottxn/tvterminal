/**
 * One-time migration: convert agent stats from JSON string to Redis HASH.
 *
 * Reads all `tvt:agent_stats:*` keys. If the value is a JSON string (old format),
 * converts it to a HASH (new format) and deletes the old key.
 *
 * Safe to run multiple times — HASH keys are skipped.
 *
 * Usage:
 *   npx tsx scripts/migrate-stats.ts
 *
 * Requires env vars: KV_REST_API_URL, KV_REST_API_TOKEN
 */

import { Redis } from "@upstash/redis"

async function main() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN")
    process.exit(1)
  }

  const redis = new Redis({ url, token })

  // Scan for all agent stats keys
  let cursor = 0
  let migrated = 0
  let skipped = 0
  let errors = 0

  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: "tvt:agent_stats:*", count: 100 })
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor) : nextCursor

    for (const key of keys) {
      const keyStr = String(key)
      try {
        // Check if it's already a HASH by trying HGETALL
        const hash = await redis.hgetall(keyStr)
        if (hash && typeof hash === "object" && Object.keys(hash).length > 0) {
          // Already a HASH — check if it has the expected fields
          const h = hash as Record<string, string>
          if ("total_broadcasts" in h) {
            skipped++
            continue
          }
        }

        // Try to read as a string (old JSON format)
        const raw = await redis.get<string>(keyStr)
        if (!raw) {
          skipped++
          continue
        }

        const stats = typeof raw === "string" ? JSON.parse(raw) : raw
        if (!stats || typeof stats !== "object") {
          console.warn(`  SKIP ${keyStr}: unexpected value type`)
          skipped++
          continue
        }

        // Write as HASH
        await redis.hset(keyStr, {
          total_broadcasts: Number(stats.total_broadcasts) || 0,
          total_slides: Number(stats.total_slides) || 0,
          last_seen: stats.last_seen || "",
          peak_viewers: Number(stats.peak_viewers) || 0,
          total_votes: Number(stats.total_votes) || 0,
        })

        // Verify by reading back
        const verify = await redis.hgetall(keyStr)
        if (verify && Object.keys(verify).length >= 5) {
          migrated++
          const name = keyStr.replace("tvt:agent_stats:", "")
          console.log(`  ✓ ${name}: ${stats.total_broadcasts} broadcasts, ${stats.total_slides} slides`)
        } else {
          console.error(`  ✗ ${keyStr}: verification failed`)
          errors++
        }
      } catch (err) {
        console.error(`  ✗ ${keyStr}: ${err}`)
        errors++
      }
    }
  } while (cursor !== 0)

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`)
  if (errors > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
