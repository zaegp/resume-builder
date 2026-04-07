import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let ratelimit: Ratelimit | null = null

function getRatelimit() {
  if (ratelimit) return ratelimit

  // Skip rate limiting if Upstash is not configured (dev mode)
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }

  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute per user
    analytics: true,
  })

  return ratelimit
}

export async function checkRateLimit(userId: string): Promise<{ success: boolean; remaining: number }> {
  const rl = getRatelimit()
  if (!rl) return { success: true, remaining: 999 } // Dev mode: no limit

  const { success, remaining } = await rl.limit(userId)
  return { success, remaining }
}
