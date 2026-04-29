import { z } from 'zod'

export const PetSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string(),
  species: z.string().default('gh0stnel'),
  stage: z.number().int().min(1).max(5),
  xp: z.number().int().min(0),
  hunger: z.number().int().min(0).max(100),
  energy: z.number().int().min(0).max(100),
  happiness: z.number().int().min(0).max(100),
  last_seen_at: z.string().datetime().optional(),
  created_at: z.string().datetime().optional(),
})

export type Pet = z.infer<typeof PetSchema>
