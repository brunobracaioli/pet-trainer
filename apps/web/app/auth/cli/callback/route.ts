// SPEC.md §6.1 step 1c — OAuth callback that completes the device-code flow.
// Node runtime (default). Receives Supabase OAuth code + the original device_code,
// exchanges the code for a session, stores it in Redis, then redirects to /auth/cli/success.
// Q2 (§13): username defaults to github_login on first profile creation.

import { createClient } from '@supabase/supabase-js'
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

const getSupabaseAnon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  )

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const deviceCode = url.searchParams.get('device_code')

  if (!code || !deviceCode) {
    return new Response('Bad Request: missing code or device_code', { status: 400 })
  }

  // Validate device_code shape before touching Redis — defends against malformed redirects.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(deviceCode)) {
    return new Response('Bad Request', { status: 400 })
  }

  const redis = getRedis()
  const existing = await redis.get(`auth:device:${deviceCode}`)
  if (existing === null) {
    return new Response('Device code expired or unknown', { status: 410 })
  }

  const supabase = getSupabaseAnon()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data?.session) {
    // Never log session payloads — contains the access token.
    console.error('callback exchange failed:', error?.message ?? 'unknown')
    return new Response('Authorization failed', { status: 502 })
  }

  await redis.set(
    `auth:device:${deviceCode}`,
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    },
    { ex: 600 }
  )

  return Response.redirect(`${url.origin}/auth/cli/success`, 303)
}
