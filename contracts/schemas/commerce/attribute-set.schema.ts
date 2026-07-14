/** Contract-first schemas: Catalog attribute sets + brand references (PROMPT-016). */
import { z } from 'zod'

const attributeDefinition = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().min(1).max(80),
  type: z.enum(['text', 'number', 'boolean', 'select']),
  required: z.boolean().optional().default(false),
  allowedValues: z.array(z.string()).optional(),
}).strict()

export const createAttributeSetRequest = z.object({
  business_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  definitions: z.array(attributeDefinition).max(50),
}).strict()

export const createBrandRefRequest = z.object({
  business_id: z.string().uuid(),
  name: z.string().min(1).max(80),
}).strict()

export type CreateAttributeSetRequest = z.infer<typeof createAttributeSetRequest>
export type CreateBrandRefRequest = z.infer<typeof createBrandRefRequest>
