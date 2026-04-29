// Test colocated with the Edge route handler. Edge runtime declaration is
// kept here as a sentinel for the .claude/hooks/guard-edge-runtime.sh hook —
// vitest ignores it; it does not affect test execution.
export const runtime = 'edge'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const VALID_USER_ID = '00000000-0000-0000-0000-0000000000aa'
const VALID_SESSION_ID = '11111111-1111-1111-1111-111111111111'

// vi.hoisted ensures these stubs are initialized BEFORE the (also hoisted) vi.mock
// factories run; otherwise referencing outer `const`s from inside vi.mock factories
// throws "cannot access X before initialization".
const mocks = vi.hoisted(() => {
  const redisMock = {
    set: vi.fn(),
    expire: vi.fn(),
    hincrby: vi.fn(),
    incrby: vi.fn(),
    zincrby: vi.fn(),
  }
  const ratelimitInstance = { limit: vi.fn() }
  const supabaseGetUser = vi.fn()
  const supabaseFrom = vi.fn()
  return { redisMock, ratelimitInstance, supabaseGetUser, supabaseFrom }
})

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => mocks.redisMock),
}))

vi.mock('@upstash/ratelimit', () => {
  const ctor = vi.fn(() => mocks.ratelimitInstance)
  ;(ctor as unknown as { slidingWindow: typeof vi.fn }).slidingWindow = vi.fn()
  return { Ratelimit: ctor }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mocks.supabaseGetUser },
    from: mocks.supabaseFrom,
  })),
}))

const { redisMock, ratelimitInstance, supabaseGetUser, supabaseFrom } = mocks

// Required env BEFORE importing the route module.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
process.env.UPSTASH_REDIS_REST_URL = 'http://localhost:8080'
process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token'

// Import AFTER mocks/env so the module reads them correctly.
import { POST } from './route'

const buildReq = (overrides: {
  body?: unknown
  authorization?: string | null
  idempotencyKey?: string | null
}): Request => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (overrides.authorization !== null) {
    headers['authorization'] = overrides.authorization ?? 'Bearer valid-token'
  }
  if (overrides.idempotencyKey !== null) {
    headers['idempotency-key'] = overrides.idempotencyKey ?? 'idem-123'
  }
  return new Request('http://test/api/v1/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(
      overrides.body ?? {
        session_id: VALID_SESSION_ID,
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
      }
    ),
  })
}

const buildSupabaseFromMock = (
  opts: {
    quests?: Array<{ id: string; match_rule: unknown; xp_reward: number }>
    existingProgress?: { status: string } | null
  } = {}
) => {
  return (table: string) => {
    if (table === 'events') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    if (table === 'quests') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: opts.quests ?? [], error: null }),
        }),
      }
    }
    if (table === 'quest_progress') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: opts.existingProgress ?? null, error: null }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'xp_ledger') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    throw new Error(`unexpected table mock: ${table}`)
  }
}

describe('POST /api/v1/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    ratelimitInstance.limit.mockResolvedValue({ success: true })
    redisMock.set.mockResolvedValue('OK')
    redisMock.expire.mockResolvedValue(1)
    redisMock.hincrby.mockResolvedValue(1)
    redisMock.incrby.mockResolvedValue(50)
    redisMock.zincrby.mockResolvedValue(50)
    supabaseFrom.mockImplementation(buildSupabaseFromMock())
  })

  it('returns 200 accepted:true for a valid event', async () => {
    const res = await POST(buildReq({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(true)
    expect(typeof body.request_id).toBe('string')
    expect(body.request_id.length).toBeGreaterThan(0)
  })

  it('returns 200 accepted:false for a duplicate Idempotency-Key', async () => {
    redisMock.set.mockResolvedValueOnce(null)
    const res = await POST(buildReq({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(false)
    expect(body.request_id).toBeNull()
  })

  it('returns 429 when the rate limit is exceeded', async () => {
    ratelimitInstance.limit.mockResolvedValueOnce({ success: false })
    const res = await POST(buildReq({}))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('Too Many Requests')
  })

  it('returns 401 when the JWT is invalid', async () => {
    supabaseGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid token' },
    })
    const res = await POST(buildReq({}))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 when the body is missing required fields', async () => {
    const res = await POST(
      buildReq({
        body: { hook_event_name: 'PostToolUse' },
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Bad Request')
    // issues is the count of validation problems — schema details are NOT
    // exposed (security: no internal schema leak via 400 response).
    expect(typeof body.issues).toBe('number')
    expect(body.issues).toBeGreaterThan(0)
  })

  it('returns 401 when Authorization header is absent', async () => {
    const res = await POST(buildReq({ authorization: null }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when Idempotency-Key header is absent', async () => {
    const res = await POST(buildReq({ idempotencyKey: null }))
    expect(res.status).toBe(400)
  })

  it('awards XP and marks quest complete when match_rule fires', async () => {
    supabaseFrom.mockImplementation(
      buildSupabaseFromMock({
        quests: [
          {
            id: 'first-edit',
            match_rule: { event_type: 'PostToolUse', tool_name: 'Edit', min_count: 1 },
            xp_reward: 50,
          },
        ],
      })
    )
    const res = await POST(buildReq({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed_quests).toEqual(['first-edit'])
    expect(redisMock.incrby).toHaveBeenCalledWith(`xp:user:${VALID_USER_ID}`, 50)
    expect(redisMock.zincrby).toHaveBeenCalledWith('lb:global:weekly', 50, VALID_USER_ID)
    expect(redisMock.zincrby).toHaveBeenCalledWith('lb:global:alltime', 50, VALID_USER_ID)
  })

  it('does not double-award an already-completed quest', async () => {
    supabaseFrom.mockImplementation(
      buildSupabaseFromMock({
        quests: [
          {
            id: 'first-edit',
            match_rule: { event_type: 'PostToolUse', tool_name: 'Edit', min_count: 1 },
            xp_reward: 50,
          },
        ],
        existingProgress: { status: 'completed' },
      })
    )
    const res = await POST(buildReq({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed_quests).toEqual([])
    expect(redisMock.incrby).not.toHaveBeenCalled()
  })
})
