// SPEC.md §6.1, §8.2 — CLI device-code OAuth flow, step 2 (poll).
// Node runtime (default) — Supabase admin SDK is not Edge-compatible.

import { Redis } from '@upstash/redis'
import { z } from 'zod'

let _redis: Redis | null = null
const getRedis = () => {
  if (_redis) return _redis
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  })
  return _redis
}

const PollBodySchema = z.object({
  device_code: z.string().uuid(),
})

const SessionPayloadSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
})

export async function POST(req: Request): Promise<Response> {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: 'Bad Request' }, { status: 400 })
  }
  const parsed = PollBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'Bad Request' }, { status: 400 })
  }
  const { device_code } = parsed.data

  const redis = getRedis()
  const value = await redis.get<string | Record<string, unknown>>(`auth:device:${device_code}`)

  if (value === null) {
    return Response.json({ status: 'expired' }, { status: 410 })
  }

  if (value === 'pending') {
    return Response.json(
      { status: 'pending' },
      { status: 202, headers: { 'cache-control': 'no-store' } }
    )
  }

  // Anything else must be a serialized Supabase session — validate before returning.
  const session = SessionPayloadSchema.safeParse(value)
  if (!session.success) {
    // Corrupt entry; treat as expired so the CLI restarts the flow.
    await redis.del(`auth:device:${device_code}`)
    return Response.json({ status: 'expired' }, { status: 410 })
  }

  // One-shot delivery — delete the Redis key so the same device_code cannot
  // hand out a token twice. The CLI persists the JWT to ~/.pet-trainer/credentials.json.
  await redis.del(`auth:device:${device_code}`)

  return Response.json(
    {
      status: 'complete',
      token: session.data.access_token,
      expires_in: session.data.expires_in ?? 3600,
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
