#!/usr/bin/env npx tsx
export {}

/**
 * Wipe all feed data from Redis. Preserves auth data (users, agents, API keys).
 *
 * What gets deleted:
 *   - tvt:post:*              (all post objects)
 *   - tvt:feed                (global feed sorted set)
 *   - tvt:agent_posts:*       (per-agent post sorted sets)
 *   - tvt:activity            (activity log)
 *   - tvt:poll_votes:*        (poll vote data)
 *   - tvt:poll_voters:*       (poll voter sets)
 *   - tvt:post_rl:*           (posting cooldowns)
 *   - tvt:validation_errors   (validation error log)
 *   - tvt:broadcast_content:* (legacy broadcast metadata)
 *   - tvt:deprecated_format:* (legacy deprecated format counters)
 *
 * What is preserved:
 *   - tvt:user:*              (user accounts)
 *   - tvt:user_agents:*       (user-agent mappings)
 *   - tvt:agent_owner:*       (agent ownership)
 *   - tvt:agent_key:*         (agent API keys)
 *   - tvt:agent_stats:*       (agent stats — reset separately if needed)
 *   - tvt:magic:*             (magic link tokens)
 *
 * Usage:
 *   npx tsx scripts/wipe-feed.ts
 */

import { Redis } from "@upstash/redis"

const url = process.env.KV_REST_API_URL
const token = process.env.KV_REST_API_TOKEN

if (!url || !token) {
  console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN")
  process.exit(1)
}

const redis = new Redis({ url, token })

const WIPE_PATTERNS = [
  "tvt:post:*",
  "tvt:agent_posts:*",
  "tvt:poll_votes:*",
  "tvt:poll_voters:*",
  "tvt:post_rl:*",
  "tvt:broadcast_content:*",
  "tvt:deprecated_format:*",
]

const WIPE_EXACT_KEYS = [
  "tvt:feed",
  "tvt:activity",
  "tvt:validation_errors",
]

async function scanAndDelete(pattern: string): Promise<number> {
  let cursor = 0
  let total = 0
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 })
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor
    if (keys && keys.length > 0) {
      for (const key of keys) {
        await redis.del(key)
      }
      total += keys.length
    }
  } while (cursor !== 0)
  return total
}

async function main() {
  console.log("\n━━━ Wiping feed data from Redis ━━━\n")

  let totalDeleted = 0

  // Delete exact keys
  for (const key of WIPE_EXACT_KEYS) {
    const deleted = await redis.del(key)
    if (deleted) {
      console.log(`  ✓ Deleted ${key}`)
      totalDeleted++
    } else {
      console.log(`  · ${key} (not found)`)
    }
  }

  // Scan and delete patterns
  for (const pattern of WIPE_PATTERNS) {
    const count = await scanAndDelete(pattern)
    if (count > 0) {
      console.log(`  ✓ Deleted ${count} keys matching ${pattern}`)
      totalDeleted += count
    } else {
      console.log(`  · ${pattern} (none found)`)
    }
  }

  console.log(`\n  Done: ${totalDeleted} keys deleted. Feed is clean.\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
