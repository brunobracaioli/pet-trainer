// SPEC.md §6.1, §8.2 — CLI device-code OAuth flow, step 1.
// Node runtime (default) — Supabase admin SDK is not Edge-compatible.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let _redis: Redis | null = null
const getRedis = () => {
  if (_redis) return _redis
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  })
  return _redis
}

let _ratelimit: Ratelimit | null = null
const getRatelimit = () => {
  if (_ratelimit) return _ratelimit
  _ratelimit = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    prefix: 'rl:cli',
  })
  return _ratelimit
}

const buildVerificationUri = (req: Request, deviceCode: string) => {
  const url = new URL(req.url)
  return `${url.origin}/auth/cli?code=${deviceCode}`
}

export async function POST(req: Request): Promise<Response> {
  // Rate-limit by client IP — prevents device-code enumeration / flooding (§5.2).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const { success } = await getRatelimit().limit(ip)
  if (!success) {
    return Response.json({ error: 'Too Many Requests' }, { status: 429 })
  }

  const deviceCode = crypto.randomUUID()
  const expiresIn = 600

  await getRedis().set(`auth:device:${deviceCode}`, 'pending', { ex: expiresIn })

  return Response.json(
    {
      device_code: deviceCode,
      verification_uri: buildVerificationUri(req, deviceCode),
      expires_in: expiresIn,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    }
  )
}
