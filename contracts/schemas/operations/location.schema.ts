/**
 * Contract-first schemas for the Locations API (OPS-001 Batch 1; CDC-001 merchant-UI
 * surface). One definition — the server parses requests with these.
 */
import { z } from 'zod'

const addressInput = z.object({
  line1: z.string().min(1).max(120),
  line2: z.string().max(120).nullable().optional(),
  city: z.string().min(1).max(80),
  region: z.string().max(80).nullable().optional(),
  postal: z.string().min(1).max(20),
  country: z.string().regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter code like DE or NL'),
}).strict()

const operatingWindowInput = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  timezone: z.string().min(1).max(64),
}).strict()

/** `home` is ghost-only (system-authored); merchants create the visible kinds. */
export const createLocationRequest = z.object({
  kind: z.enum(['store', 'warehouse', 'fulfillment_center', 'partner', 'temporary', 'popup']),
  name: z.string().min(1).max(80),
  address: addressInput.nullable().optional(),
  pickup_instructions: z.string().max(500).nullable().optional(),
  operating_window: operatingWindowInput.nullable().optional(),
}).strict()
export type CreateLocationRequest = z.infer<typeof createLocationRequest>

export const updateLocationRequest = z.object({
  name: z.string().min(1).max(80).optional(),
  address: addressInput.nullable().optional(),
  pickup_instructions: z.string().max(500).nullable().optional(),
  operating_window: operatingWindowInput.nullable().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, { message: 'at least one field must be provided' })
export type UpdateLocationRequest = z.infer<typeof updateLocationRequest>

export const emptyLocationRequest = z.object({}).strict()

export const listLocationsQuerySchema = z.object({
  business_id: z.string().uuid(),
})
