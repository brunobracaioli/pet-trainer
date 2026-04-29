import type { EventPayload } from '@specops/domain'
import type { MatchRule, LeafOperator } from './types'
import { OPERATORS } from './operators'

const RESERVED = new Set(['min_count', 'and', 'or', 'not'])

const FIELD_ALIASES: Record<string, string> = {
  event_type: 'hook_event_name',
}

const resolveFieldPath = (event: EventPayload, path: string): unknown => {
  const normalized = FIELD_ALIASES[path] ?? path
  const parts = normalized.split('.')
  let value: unknown = event
  for (const part of parts) {
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

const matchesConstraint = (fieldValue: unknown, constraint: unknown): boolean => {
  if (
    constraint === null ||
    typeof constraint === 'string' ||
    typeof constraint === 'number' ||
    typeof constraint === 'boolean'
  ) {
    return OPERATORS.equals(fieldValue, constraint)
  }
  if (typeof constraint !== 'object' || Array.isArray(constraint)) {
    return false
  }
  for (const [op, ruleValue] of Object.entries(constraint as Record<string, unknown>)) {
    const fn = OPERATORS[op as LeafOperator]
    if (!fn) return false
    if (!fn(fieldValue, ruleValue)) return false
  }
  return true
}

/**
 * Evaluates a match rule against a single event.
 *
 * Returns `true` when the structural part of the rule matches.
 *
 * `min_count` is intentionally ignored here. The caller (the `/api/v1/events`
 * handler in step 01-04) is responsible for counting how many times the
 * structural rule has matched within the relevant window (using the
 * `session:{session_id}` Redis hash from SPEC.md §5.2) and comparing the
 * resulting count to `rule.min_count`. Counting inside the evaluator would
 * couple this pure module to Redis and break the Edge Runtime guarantee.
 *
 * Field paths support dot notation (`tool_input.file_path`). The alias
 * `event_type` resolves to `hook_event_name` to match the SPEC §7.1 DSL
 * authoring style without renaming the EventPayload schema field.
 */
export const evaluateMatchRule = (rule: MatchRule, event: EventPayload): boolean => {
  if (Array.isArray(rule.and)) {
    if (!rule.and.every((sub) => evaluateMatchRule(sub, event))) return false
  }
  if (Array.isArray(rule.or)) {
    if (!rule.or.some((sub) => evaluateMatchRule(sub, event))) return false
  }
  if (rule.not && typeof rule.not === 'object' && !Array.isArray(rule.not)) {
    if (evaluateMatchRule(rule.not as MatchRule, event)) return false
  }

  for (const [key, constraint] of Object.entries(rule)) {
    if (RESERVED.has(key)) continue
    const fieldValue = resolveFieldPath(event, key)
    if (!matchesConstraint(fieldValue, constraint)) return false
  }

  return true
}
