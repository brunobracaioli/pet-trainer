// SPEC.md §8.3, §8.4 — pet-trainer hook ingestion endpoint.
// 5xx responses from this handler must NOT trigger automatic retries in the hook
// (§8.3 fire-and-forget). The offline buffer + `pet sync` is the retry path.
// We deliberately do not set Retry-After headers.

import { createClient } from '@supabase/supabase-js'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { EventPayloadSchema } from '@specops/domain'
import { evaluateMatchRule, type MatchRule } from '@specops/quest-engine'

export const runtime = 'edge'

let _redis: Redis | null = null
const getRedis = (): Redis => {
  if (_redis) return _redis
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  })
  return _redis
}

let _ratelimit: Ratelimit | null = null
const getRatelimit = (): Ratelimit => {
  if (_ratelimit) return _ratelimit
  _ratelimit = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(120, '60 s'),
    prefix: 'rl:events',
  })
  return _ratelimit
}

const getSupabaseAnon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  )

const getSupabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

// SPEC.md §10.2 — payload truncation cap of 1KB for tool_input/tool_response.
const truncate = (value: unknown): unknown => {
  if (value === undefined) return undefined
  try {
    const str = JSON.stringify(value)
    if (str.length <= 1024) return value
    return { truncated: true, raw: str.slice(0, 1024) }
  } catch {
    return { truncated: true }
  }
}

export async function POST(req: Request): Promise<Response> {
  // Step 1 — JWT validation
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: userData, error: authError } = await getSupabaseAnon().auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  // Step 2 — Rate limit (120 req / 60s sliding window per user)
  const { success } = await getRatelimit().limit(userId)
  if (!success) {
    return Response.json({ error: 'Too Many Requests' }, { status: 429 })
  }

  // Step 3 — Idempotency
  const idempotencyKey = req.headers.get('idempotency-key')
  if (!idempotencyKey) {
    return Response.json(
      { error: 'Bad Request', issues: 'Idempotency-Key header required' },
      { status: 400 }
    )
  }
  const redis = getRedis()
  // Idempotency key is scoped per user — preventing a known/guessed key from
  // one user from suppressing event ingestion for another user.
  const setResult = await redis.set(`evt:idem:${userId}:${idempotencyKey}`, '1', {
    nx: true,
    ex: 86400,
  })
  if (setResult === null) {
    return Response.json({ accepted: false, request_id: null }, { status: 200 })
  }

  // Step 4 — Parse + validate body
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: 'Bad Request', issues: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = EventPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    // Do not echo Zod's full issue list — that would leak internal schema
    // shape (field paths, type constraints) to the caller. Return only the
    // count so clients can detect malformed payloads without learning the
    // schema surface.
    return Response.json(
      { error: 'Bad Request', issues: parsed.error.issues.length },
      { status: 400 }
    )
  }
  const eventPayload = parsed.data
  const persistedPayload = {
    tool_input: truncate(eventPayload.tool_input),
    tool_response: truncate(eventPayload.tool_response),
  }

  // Step 5 — Persist to events table (fire-and-forget)
  const supabaseAdmin = getSupabaseAdmin()
  const insertPromise = supabaseAdmin.from('events').insert({
    user_id: userId,
    session_id: eventPayload.session_id,
    event_type: eventPayload.hook_event_name,
    tool_name: eventPayload.tool_name ?? null,
    payload: persistedPayload,
    idempotency_key: idempotencyKey,
  })
  insertPromise.then((res) => {
    // Log only the message — the full PostgREST error object can include
    // table / column / constraint identifiers we do not want in shared logs.
    if (res.error) console.error('event insert failed:', res.error?.message ?? 'unknown')
  })

  // Step 6 — Evaluate active match rules
  const { data: quests } = await supabaseAdmin
    .from('quests')
    .select('id, match_rule, xp_reward')
    .eq('is_active', true)

  const completedQuestIds: string[] = []
  if (quests) {
    for (const quest of quests as Array<{ id: string; match_rule: unknown; xp_reward: number }>) {
      const rule = quest.match_rule as MatchRule
      if (!evaluateMatchRule(rule, eventPayload)) continue

      const minCount = typeof rule.min_count === 'number' ? rule.min_count : 1
      if (minCount > 1) {
        const sessionKey = `session:${eventPayload.session_id}`
        const count = await redis.hincrby(sessionKey, quest.id, 1)
        // Refresh TTL on every hincrby so long-lived sessions don't accumulate
        // forever. 24h matches the events-table partition cadence.
        await redis.expire(sessionKey, 86400)
        if (count < minCount) continue
      }

      // Atomic guard against double-spend — Redis SET NX is the single source
      // of truth for "XP already awarded for this user+quest". This protects
      // against the read-then-write race in the select/upsert pattern below
      // when two events arrive concurrently.
      const awardLock = await redis.set(`xp:awarded:${userId}:${quest.id}`, '1', { nx: true })
      if (awardLock === null) continue

      const { data: existing } = await supabaseAdmin
        .from('quest_progress')
        .select('status')
        .eq('user_id', userId)
        .eq('quest_id', quest.id)
        .maybeSingle()
      if (existing && (existing as { status: string }).status === 'completed') continue

      // Step 7 — Award XP + leaderboard + mark completed
      await Promise.all([
        redis.incrby(`xp:user:${userId}`, quest.xp_reward),
        supabaseAdmin.from('xp_ledger').insert({
          user_id: userId,
          delta: quest.xp_reward,
          reason: `quest:${quest.id}`,
          ref_id: quest.id,
        }),
        redis.zincrby('lb:global:weekly', quest.xp_reward, userId),
        redis.zincrby('lb:global:alltime', quest.xp_reward, userId),
        supabaseAdmin.from('quest_progress').upsert({
          user_id: userId,
          quest_id: quest.id,
          status: 'completed',
          completed_at: new Date().toISOString(),
          evidence: { idempotency_key: idempotencyKey },
        }),
      ])
      completedQuestIds.push(quest.id)
    }
  }

  return Response.json(
    {
      accepted: true,
      request_id: crypto.randomUUID(),
      completed_quests: completedQuestIds,
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
