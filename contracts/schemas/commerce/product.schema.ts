/**
 * Contract-first schemas for the Product API (IMP-COM-001B, BLUEPRINT-002 §4).
 * One definition — server parses requests with these; response DTO types are inferred.
 */
import { z } from 'zod'

const uuid = z.string().uuid()
// N2 (ACCEPTANCE-001): money errors must educate — minor units are not obvious.
const MINOR_UNITS_HINT = 'prices are integer minor units — send 1499 for \u20ac14.99, never decimals'
const money = z.object({
  amount: z.number({ invalid_type_error: MINOR_UNITS_HINT })
    .int(MINOR_UNITS_HINT)
    .nonnegative('price cannot be negative'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code like EUR'),
}).strict()

const saleInput = z.object({
  amount: z.number().int().nonnegative(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
}).strict()

const variantInput = z.object({
  sku: z.string().min(1).max(64).optional(),
  option_values: z.record(z.string().min(1).max(30), z.string().min(1).max(40)).optional(),
  price: money,
  sale: saleInput.nullable().optional(),
  kind_data: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict()

const mediaInput = z.object({
  media_id: uuid,
  variant_id: uuid.nullable().optional(),
  role: z.enum(['gallery', 'hero', 'swatch']).optional(),
  alt_text: z.string().max(300).nullable().optional(),
}).strict()

const description = z.object({
  format: z.enum(['plain', 'markdown']).optional(),
  content: z.string().min(1).max(20_000),
}).strict()

export const createProductRequest = z.object({
  business_id: uuid,
  title: z.string().min(1).max(140),
  description: description.nullable().optional(),
  fulfillment_kind: z.enum(['physical', 'digital', 'service']),
  category_path: z.string().max(200).nullable().optional(),
  options: z.array(z.object({ name: z.string().min(1).max(30), values: z.array(z.string().min(1).max(40)).min(1).max(50) }).strict()).max(3).optional(),
  variants: z.array(variantInput).max(100).optional(),
  default_price: money.optional(),
  media: z.array(mediaInput).max(50).optional(),
  /** Same-transaction publication to a store (VISIBILITY_CONTRACT §6). */
  publish_to_store_id: uuid.nullable().optional(),
}).strict()
export type CreateProductRequest = z.infer<typeof createProductRequest>

export const updateProductRequest = z.object({
  title: z.string().min(1).max(140).optional(),
  description: description.nullable().optional(),
  category_path: z.string().max(200).nullable().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, { message: 'at least one field must be provided' })
export type UpdateProductRequest = z.infer<typeof updateProductRequest>

export const addVariantRequest = variantInput
export type AddVariantRequest = z.infer<typeof addVariantRequest>

export const updateVariantRequest = z.object({
  sku: z.string().min(1).max(64).optional(),
  price: money.optional(),
  sale: saleInput.nullable().optional(),
  option_values: z.record(z.string().min(1).max(30), z.string().min(1).max(40)).optional(),
  kind_data: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict()
export type UpdateVariantRequest = z.infer<typeof updateVariantRequest>

export const addMediaRequest = mediaInput
export type AddMediaRequest = z.infer<typeof addMediaRequest>

export const reorderMediaRequest = z.object({
  ordered_ids: z.array(uuid).min(1).max(50),
}).strict()
export type ReorderMediaRequest = z.infer<typeof reorderMediaRequest>

export const emptyRequest = z.object({}).strict()

export const listProductsQuerySchema = z.object({
  business_id: uuid,
  status: z.enum(['draft', 'active', 'archived']).optional(),
  /** Default grid hides archived products (ACCEPTANCE-001 N1); opt in explicitly. */
  show_archived: z.enum(['true', 'false']).optional(),
  /** Simple title search (ACCEPTANCE-001 N4) — a DB filter, not the Search domain. */
  q: z.string().min(1).max(140).optional(),
  /** Merchant grid: annotate each row with on_store for this channel (the store). */
  channel_id: uuid.optional(),
  limit: z.string().optional(),
  cursor: z.string().max(512).optional(),
})

// ——— Option management (ACCEPTANCE-001 C2; options are identified by NAME)
export const addOptionRequest = z.object({
  name: z.string().min(1).max(30),
  values: z.array(z.string().min(1).max(40)).min(1).max(50),
  /** Convenience: apply this value to every existing variant. */
  existing_variants_value: z.string().min(1).max(40).optional(),
  /** Precise per-variant assignment: { variant_id: value }. */
  variant_assignments: z.record(uuid, z.string().min(1).max(40)).optional(),
}).strict()
export type AddOptionRequest = z.infer<typeof addOptionRequest>

export const patchOptionRequest = z.object({
  add_values: z.array(z.string().min(1).max(40)).min(1).max(50),
}).strict()
export type PatchOptionRequest = z.infer<typeof patchOptionRequest>

export const addOptionValuesRequest = z.object({
  values: z.array(z.string().min(1).max(40)).min(1).max(50),
}).strict()
export type AddOptionValuesRequest = z.infer<typeof addOptionValuesRequest>
