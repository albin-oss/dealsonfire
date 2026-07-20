/** Contract-first schemas: deals — the social half (Release 0.3). */
import { z } from 'zod'

export const createDealRequest = z.object({
  product_id: z.string().uuid(),
  store_id: z.string().uuid(),
  headline: z.string().min(1).max(90),
  story: z.string().max(600).nullable().optional(),
}).strict()
export type CreateDealRequest = z.infer<typeof createDealRequest>
