import { describe, it, expect } from 'vitest'
import type { EventPayload } from '@specops/domain'
import { evaluateMatchRule } from './evaluator'
import type { MatchRule } from './types'

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000'

const buildEvent = (overrides: Partial<EventPayload> = {}): EventPayload => ({
  session_id: SESSION_ID,
  hook_event_name: 'PostToolUse',
  ...overrides,
})

// SPEC.md §7.1 — three example rules verbatim
const FIRST_EDIT: MatchRule = {
  event_type: 'PostToolUse',
  tool_name: 'Edit',
  min_count: 1,
}

const CONFIGURE_POSTTOOLUSE_HOOK: MatchRule = {
  event_type: 'PostToolUse',
  tool_name: 'Edit',
  'tool_input.file_path': { endsWith: '.claude/settings.json' },
  'tool_input.new_string': { contains: 'PostToolUse' },
  min_count: 1,
}

const SPAWN_SUBAGENT: MatchRule = {
  event_type: 'PostToolUse',
  tool_name: 'Task',
  min_count: 1,
}

describe('SPEC §7.1 example rules', () => {
  it('first-edit matches a PostToolUse Edit event', () => {
    const event = buildEvent({ tool_name: 'Edit' })
    expect(evaluateMatchRule(FIRST_EDIT, event)).toBe(true)
  })

  it('first-edit does NOT match a PostToolUse Bash event', () => {
    const event = buildEvent({ tool_name: 'Bash' })
    expect(evaluateMatchRule(FIRST_EDIT, event)).toBe(false)
  })

  it('configure-posttooluse-hook matches an Edit on settings.json with PostToolUse content', () => {
    const event = buildEvent({
      tool_name: 'Edit',
      tool_input: {
        file_path: '/home/user/.claude/settings.json',
        new_string: 'PostToolUse hook configured',
      },
    })
    expect(evaluateMatchRule(CONFIGURE_POSTTOOLUSE_HOOK, event)).toBe(true)
  })

  it('configure-posttooluse-hook rejects unrelated file path', () => {
    const event = buildEvent({
      tool_name: 'Edit',
      tool_input: {
        file_path: '/home/user/notes.md',
        new_string: 'PostToolUse hook configured',
      },
    })
    expect(evaluateMatchRule(CONFIGURE_POSTTOOLUSE_HOOK, event)).toBe(false)
  })

  it('spawn-subagent matches the Task tool', () => {
    const event = buildEvent({ tool_name: 'Task' })
    expect(evaluateMatchRule(SPAWN_SUBAGENT, event)).toBe(true)
  })
})

describe('leaf operators', () => {
  it('equals — primitive top-level field', () => {
    expect(evaluateMatchRule({ tool_name: 'Edit' }, buildEvent({ tool_name: 'Edit' }))).toBe(true)
    expect(evaluateMatchRule({ tool_name: 'Edit' }, buildEvent({ tool_name: 'Bash' }))).toBe(false)
  })

  it('contains', () => {
    const rule: MatchRule = { 'tool_input.new_string': { contains: 'foo' } }
    expect(
      evaluateMatchRule(rule, buildEvent({ tool_input: { new_string: 'this has foo inside' } }))
    ).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { new_string: 'no match' } }))).toBe(
      false
    )
  })

  it('startsWith', () => {
    const rule: MatchRule = { 'tool_input.command': { startsWith: 'git ' } }
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { command: 'git status' } }))).toBe(
      true
    )
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { command: 'pnpm install' } }))).toBe(
      false
    )
  })

  it('endsWith', () => {
    const rule: MatchRule = { 'tool_input.file_path': { endsWith: '.ts' } }
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { file_path: 'src/main.ts' } }))).toBe(
      true
    )
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { file_path: 'src/main.js' } }))).toBe(
      false
    )
  })

  it('regex — pattern hits and misses; invalid pattern yields false', () => {
    const rule: MatchRule = { tool_name: { regex: '^Edit$' } }
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Edit' }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'EditFile' }))).toBe(false)
    const broken: MatchRule = { tool_name: { regex: '[' } }
    expect(evaluateMatchRule(broken, buildEvent({ tool_name: 'Edit' }))).toBe(false)
  })

  it('gte / lte — boundary values', () => {
    const rule: MatchRule = { 'tool_input.size': { gte: 100, lte: 200 } }
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { size: 100 } }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { size: 150 } }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { size: 200 } }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { size: 99 } }))).toBe(false)
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { size: 201 } }))).toBe(false)
  })

  it('in', () => {
    const rule: MatchRule = { tool_name: { in: ['Edit', 'Write', 'Bash'] } }
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Edit' }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Read' }))).toBe(false)
  })
})

describe('composite operators', () => {
  it('and — all subrules must match', () => {
    const rule: MatchRule = {
      and: [{ tool_name: 'Edit' }, { event_type: 'PostToolUse' }],
    }
    expect(
      evaluateMatchRule(rule, buildEvent({ tool_name: 'Edit', hook_event_name: 'PostToolUse' }))
    ).toBe(true)
    expect(
      evaluateMatchRule(rule, buildEvent({ tool_name: 'Bash', hook_event_name: 'PostToolUse' }))
    ).toBe(false)
  })

  it('or — any subrule matches', () => {
    const rule: MatchRule = {
      or: [{ tool_name: 'Edit' }, { tool_name: 'Write' }],
    }
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Edit' }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Write' }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Bash' }))).toBe(false)
  })

  it('not — inverts subrule', () => {
    const rule: MatchRule = { not: { tool_name: 'Bash' } }
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Edit' }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Bash' }))).toBe(false)
  })
})

describe('field path resolution', () => {
  it('dotted path resolves nested object value', () => {
    const rule: MatchRule = { 'tool_input.file_path': '/etc/passwd' }
    expect(evaluateMatchRule(rule, buildEvent({ tool_input: { file_path: '/etc/passwd' } }))).toBe(
      true
    )
  })

  it('missing nested field yields false (no throw)', () => {
    const rule: MatchRule = { 'tool_input.file_path': { contains: 'x' } }
    expect(evaluateMatchRule(rule, buildEvent({}))).toBe(false)
  })

  it('event_type alias maps to hook_event_name', () => {
    const rule: MatchRule = { event_type: 'PreToolUse' }
    expect(evaluateMatchRule(rule, buildEvent({ hook_event_name: 'PreToolUse' }))).toBe(true)
    expect(evaluateMatchRule(rule, buildEvent({ hook_event_name: 'PostToolUse' }))).toBe(false)
  })
})

describe('min_count semantics', () => {
  it('min_count is ignored by the evaluator (caller responsibility)', () => {
    const rule: MatchRule = { tool_name: 'Edit', min_count: 999 }
    expect(evaluateMatchRule(rule, buildEvent({ tool_name: 'Edit' }))).toBe(true)
  })
})
