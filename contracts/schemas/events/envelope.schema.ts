/**
 * Published-language event envelope (BLUEPRINT §7). External consumers validate with this;
 * they MUST tolerate unknown payload fields (ADR-001 §5.5) — hence passthrough().
 */
import { z } from 'zod'

export const eventEnvelope = z.object({
  event_id: z.string().uuid(),
  event_type: z.string().min(1),
  schema_version: z.number().int().positive(),
  occurred_at: z.string().datetime(),
  business_id: z.string().uuid().nullable(),
  aggregate: z.object({
    type: z.string(),
    id: z.string().uuid(),
    sequence: z.number().int().positive(),
  }),
  actor: z.object({
    type: z.enum(['user', 'ai_agent', 'admin', 'system']),
    id: z.string(),
    membership_id: z.string().uuid().optional(),
  }),
  // Traceability (ADR-003 §4, ADR-004 C1): correlation enters at the edge; consumers chain
  // causation. Nullable — pre-0003 events and pure system schedules carry no trace.
  correlation_id: z.string().uuid().nullable().optional(),
  causation_id: z.string().uuid().nullable().optional(),
  payload: z.object({}).passthrough(),
})
export type EventEnvelope = z.infer<typeof eventEnvelope>
