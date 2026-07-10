import type { Tx, CapabilityRepository, CapabilityDefinition } from '../domain/ports'
import type { BusinessId } from '../../shared-kernel/ids'
import type { TrustLevel, ScaleTier } from '../../shared-kernel/trust'
import { asClient } from '@platform/db'

interface DefRow {
  key: string
  required_trust_level: TrustLevel
  required_scale_tier: ScaleTier
  dependencies: string[]
  default_available: boolean
}

export class PgCapabilityRepository implements CapabilityRepository {
  async allDefinitions(tx: Tx): Promise<CapabilityDefinition[]> {
    const { rows } = await asClient(tx).query<DefRow>(
      'SELECT key, required_trust_level, required_scale_tier, dependencies, default_available FROM capabilities',
    )
    return rows.map((row) => ({
      key: row.key,
      requiredTrustLevel: row.required_trust_level,
      requiredScaleTier: row.required_scale_tier,
      dependencies: row.dependencies,
      defaultAvailable: row.default_available,
    }))
  }

  async liveEntitlementKeys(tx: Tx, businessId: BusinessId): Promise<string[]> {
    const { rows } = await asClient(tx).query<{ capability_key: string }>(
      `SELECT capability_key FROM business_entitlements
       WHERE business_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
      [businessId],
    )
    return rows.map((r) => r.capability_key)
  }
}
