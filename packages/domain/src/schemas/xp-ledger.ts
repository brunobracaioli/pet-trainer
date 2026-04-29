import { z } from 'zod'

export const XpLedgerSchema = z.object({
  id: z.number().int().optional(),
  user_id: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string(),
  ref_id: z.string().optional(),
  created_at: z.string().datetime().optional(),
})

export type XpLedger = z.infer<typeof XpLedgerSchema>
