/** Contract-first schemas for the auth API (WP-R1-B1). */
import { z } from 'zod'

export const registerRequest = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
  display_name: z.string().max(80).nullable().optional(),
  /** Optional Ignite claim context: attach a draft to the new account (US-8). */
  claim: z.object({ type: z.string().max(40), ref: z.string().max(200) }).strict().optional(),
}).strict()
export type RegisterRequest = z.infer<typeof registerRequest>

export const loginRequest = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional().default(true),
}).strict()

export const requestResetRequest = z.object({ email: z.string().min(3).max(254) }).strict()

export const performResetRequest = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(200),
}).strict()

export const verifyEmailRequest = z.object({ token: z.string().min(10).max(200) }).strict()

/** Resend a verification email. Uniform answer (enumeration-proof), like recovery/request. */
export const resendVerificationRequest = z.object({ email: z.string().min(3).max(254) }).strict()

export const stepUpRequest = z.object({ password: z.string().min(1).max(200) }).strict()

export const webauthnVerifyRegistrationRequest = z.object({
  challenge_id: z.string().uuid(),
  response: z.record(z.string(), z.unknown()),
  label: z.string().max(60).nullable().optional(),
}).strict()

export const webauthnAuthenticateRequest = z.object({
  challenge_id: z.string().uuid(),
  response: z.record(z.string(), z.unknown()),
}).strict()

export const emptyRequest = z.object({}).strict()
