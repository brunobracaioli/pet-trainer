import type { LeafOperator } from './types'

export const opEquals = (fieldValue: unknown, ruleValue: unknown): boolean =>
  fieldValue === ruleValue

export const opContains = (fieldValue: unknown, ruleValue: unknown): boolean =>
  String(fieldValue).includes(String(ruleValue))

export const opStartsWith = (fieldValue: unknown, ruleValue: unknown): boolean =>
  String(fieldValue).startsWith(String(ruleValue))

export const opEndsWith = (fieldValue: unknown, ruleValue: unknown): boolean =>
  String(fieldValue).endsWith(String(ruleValue))

export const opRegex = (fieldValue: unknown, ruleValue: unknown): boolean => {
  try {
    return new RegExp(String(ruleValue)).test(String(fieldValue))
  } catch {
    return false
  }
}

export const opGte = (fieldValue: unknown, ruleValue: unknown): boolean => {
  const a = Number(fieldValue)
  const b = Number(ruleValue)
  return Number.isFinite(a) && Number.isFinite(b) && a >= b
}

export const opLte = (fieldValue: unknown, ruleValue: unknown): boolean => {
  const a = Number(fieldValue)
  const b = Number(ruleValue)
  return Number.isFinite(a) && Number.isFinite(b) && a <= b
}

export const opIn = (fieldValue: unknown, ruleValue: unknown): boolean =>
  Array.isArray(ruleValue) && ruleValue.includes(fieldValue)

export const OPERATORS: Record<LeafOperator, (f: unknown, r: unknown) => boolean> = {
  equals: opEquals,
  contains: opContains,
  startsWith: opStartsWith,
  endsWith: opEndsWith,
  regex: opRegex,
  gte: opGte,
  lte: opLte,
  in: opIn,
}
