/**
 * Idempotent seed runner: upserts the capability registry (BLUEPRINT-001 §5).
 * Safe to run on every deploy — bumps nothing unless a row actually changed.
 */
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { CAPABILITY_SEED } from './seeds/capability-registry'

export async function seed(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('BEGIN')
    for (const cap of CAPABILITY_SEED) {
      await client.query(
        `INSERT INTO capabilities
           (key, description, required_trust_level, required_scale_tier, required_permissions, dependencies, default_available)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (key) DO UPDATE SET
           description = EXCLUDED.description,
           required_trust_level = EXCLUDED.required_trust_level,
           required_scale_tier = EXCLUDED.required_scale_tier,
           required_permissions = EXCLUDED.required_permissions,
           dependencies = EXCLUDED.dependencies,
           default_available = EXCLUDED.default_available,
           version = capabilities.version + 1
         WHERE (capabilities.description, capabilities.required_trust_level, capabilities.required_scale_tier,
                capabilities.required_permissions, capabilities.dependencies, capabilities.default_available)
            IS DISTINCT FROM
               (EXCLUDED.description, EXCLUDED.required_trust_level, EXCLUDED.required_scale_tier,
                EXCLUDED.required_permissions, EXCLUDED.dependencies, EXCLUDED.default_available)`,
        [cap.key, cap.description, cap.requiredTrustLevel, cap.requiredScaleTier, cap.requiredPermissions, cap.dependencies, cap.defaultAvailable],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL ?? process.env.NUXT_DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL (or NUXT_DATABASE_URL) is required')
    process.exit(1)
  }
  seed(url)
    .then(() => console.log('capability registry seeded'))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
