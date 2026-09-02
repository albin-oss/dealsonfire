/**
 * The seed registry (LS-8, Reality Ledger) — the mechanical seam between
 * synthetic and real. dev-demo.ts creates its world under these deterministic
 * principal ids; any store whose business has a staff membership for one of
 * them is SEEDED, and every behavioral fact attached to such a store is
 * synthetic-adjacent. Learning queries use this registry so a Founder report
 * can never say "people searched for X" about our own seed script.
 *
 * LAW: dev-demo seeding must NEVER run against a cohort or production
 * environment. Environment separation is the primary wall; this registry is
 * the belt to that wall's suspenders — and the label for founder-walk
 * evidence gathered in the demo world.
 */
export const SEED_PRINCIPAL_IDS = [
  '11111111-1111-4111-8111-111111111111', // Rosa Knits
  '22222222-2222-4222-8222-222222222222', // Ember & Oak
  '33333333-3333-4333-8333-333333333333', // Pixel & Paper
  '44444444-4444-4444-8444-444444444444', // Grain & Crumb
  '55555555-5555-4555-8555-555555555555', // Kettle Mountain
  '66666666-6666-4666-8666-666666666666', // Oak & Understory
  '77777777-7777-4777-8777-777777777777', // Second Wind
  '88888888-8888-4888-8888-888888888888', // Clean Slate
] as const

/** SQL: ids of seeded stores (their business has a seed principal on staff). */
export const SEEDED_STORES_SQL = `
  SELECT DISTINCT st.id FROM stores st
  JOIN staff_memberships sm ON sm.business_id = st.business_id
  WHERE sm.principal_id IN (${SEED_PRINCIPAL_IDS.map((id) => `'${id}'`).join(', ')})`
