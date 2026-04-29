import { z } from 'zod'

export const QuestCategorySchema = z.enum([
  'basics',
  'permissions',
  'hooks',
  'slash-commands',
  'subagents',
  'skills-mcp',
])

export type QuestCategory = z.infer<typeof QuestCategorySchema>

export const QuestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: z.number().int().min(1).max(5),
  xp_reward: z.number().int().positive(),
  required_tool: z.string().optional(),
  match_rule: z.record(z.unknown()),
  category: QuestCategorySchema,
  unlocks_after: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
})

export type Quest = z.infer<typeof QuestSchema>
