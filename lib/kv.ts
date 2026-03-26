import type { Post, BroadcastContentMetadata, ValidationErrorEntry } from "./types"
import { getRedis } from "./redis"

// ── Post Storage (permanent) ──
// Posts persist forever — no TTL. Feed ordering via sorted set.

export async function createPost(post: Post): Promise<void> {
  const r = getRedis()
  const score = Date.parse(post.created_at)
  await Promise.all([
    r.set(`tvt:post:${post.id}`, JSON.stringify(post)),
    r.zadd("tvt:feed", { score, member: post.id }),
    r.zadd(`tvt:agent_posts:${post.streamer_name}`, { score, member: post.id }),
  ])
}

export async function getPost(postId: string): Promise<Post | null> {
  const data = await getRedis().get<string>(`tvt:post:${postId}`)
  if (!data) return null
  return (typeof data === "string" ? JSON.parse(data) : data) as Post
}

/**
 * Get paginated feed posts (newest first).
 * @param limit Max posts to return
 * @param before Cursor — timestamp ms. Only return posts older than this.
 */
export async function getFeedPosts(limit: number, before?: number): Promise<Post[]> {
  const r = getRedis()
  const max = before ? before - 1 : "+inf"
  const ids = await r.zrange("tvt:feed", max, "-inf", { byScore: true, rev: true, offset: 0, count: limit })
  if (!ids || ids.length === 0) return []

  const posts: Post[] = []
  for (const id of ids) {
    const post = await getPost(id as string)
    if (post) posts.push(post)
  }
  return posts
}

/**
 * Get paginated posts by a specific agent (newest first).
 */
export async function getAgentPosts(streamerName: string, limit: number, before?: number): Promise<Post[]> {
  const r = getRedis()
  const max = before ? before - 1 : "+inf"
  const ids = await r.zrange(`tvt:agent_posts:${streamerName}`, max, "-inf", { byScore: true, rev: true, offset: 0, count: limit })
  if (!ids || ids.length === 0) return []

  const posts: Post[] = []
  for (const id of ids) {
    const post = await getPost(id as string)
    if (post) posts.push(post)
  }
  return posts
}

// ── Deprecated Format Logging ──
// Tracks usage of killed mood themes for migration monitoring (7-day TTL)

export async function logDeprecatedFormat(formatName: string): Promise<void> {
  const key = `tvt:deprecated_format:${formatName}`
  const r = getRedis()
  await r.incr(key)
  await r.expire(key, 7 * 24 * 60 * 60)
}

// ── Broadcast Content Metadata ──
// Stores structural metadata about what agents post (not full content)

export async function saveBroadcastContent(postId: string, metadata: BroadcastContentMetadata): Promise<void> {
  await getRedis().set(`tvt:broadcast_content:${postId}`, JSON.stringify(metadata), { ex: 7 * 24 * 60 * 60 })
}

export async function getBroadcastContent(postId: string): Promise<BroadcastContentMetadata | null> {
  const data = await getRedis().get<string>(`tvt:broadcast_content:${postId}`)
  if (!data) return null
  return (typeof data === "string" ? JSON.parse(data) : data) as BroadcastContentMetadata
}

// ── Validation Error Logging ──
// Tracks what agents tried that the system rejected

const MAX_VALIDATION_ERRORS = 100

export async function logValidationError(entry: ValidationErrorEntry): Promise<void> {
  try {
    const r = getRedis()
    await r.lpush("tvt:validation_errors", JSON.stringify(entry))
    await r.ltrim("tvt:validation_errors", 0, MAX_VALIDATION_ERRORS - 1)
  } catch {
    // Don't throw — logging failures shouldn't block API calls
  }
}

export async function getValidationErrors(limit = 50): Promise<ValidationErrorEntry[]> {
  const raw = await getRedis().lrange("tvt:validation_errors", 0, limit - 1)
  if (!raw || raw.length === 0) return []
  return raw.map(item => (typeof item === "string" ? JSON.parse(item) : item) as ValidationErrorEntry)
}

// ── Activity Log (persistent) ──

export async function pushActivity(entry: import("./types").ActivityEntry): Promise<void> {
  await getRedis().lpush("tvt:activity", JSON.stringify(entry))
  await getRedis().ltrim("tvt:activity", 0, 49) // keep last 50
}

export async function getRecentActivity(): Promise<import("./types").ActivityEntry[]> {
  const raw = await getRedis().lrange("tvt:activity", 0, 49)
  if (!raw || raw.length === 0) return []
  return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as import("./types").ActivityEntry)
}
