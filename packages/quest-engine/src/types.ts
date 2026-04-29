export type LeafOperator =
  | 'equals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'regex'
  | 'gte'
  | 'lte'
  | 'in'

export type FieldConstraint =
  | string
  | number
  | boolean
  | null
  | Partial<Record<LeafOperator, unknown>>

export type MatchRule = {
  min_count?: number
  and?: MatchRule[]
  or?: MatchRule[]
  not?: MatchRule
  [field: string]: FieldConstraint | MatchRule | MatchRule[] | number | undefined
}
