/** Contract-first schemas: sparks — the content layer (Release 0.6). */
import { z } from 'zod'

export const publishSparkRequest = z.object({
  business_id: z.string().uuid(),
  store_id: z.string().uuid(),
  body: z.string().min(1).max(500),
  media_id: z.string().uuid().nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
}).strict()
export type PublishSparkRequest = z.infer<typeof publishSparkRequest>
