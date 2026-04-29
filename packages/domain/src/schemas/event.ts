import { z } from 'zod'

export const EventPayloadSchema = z.object({
  session_id: z.string().uuid(),
  hook_event_name: z.string(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.unknown()).optional(),
  tool_response: z.record(z.unknown()).optional(),
})

export type EventPayload = z.infer<typeof EventPayloadSchema>
