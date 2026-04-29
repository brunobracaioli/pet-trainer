import { z } from 'zod'

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1).max(39),
  github_login: z.string(),
  avatar_url: z.string().url().optional(),
  created_at: z.string().datetime().optional(),
  preferences: z.record(z.unknown()).default({}),
})

export type Profile = z.infer<typeof ProfileSchema>
