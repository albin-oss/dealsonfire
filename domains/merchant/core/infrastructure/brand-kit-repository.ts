import type { Tx, BrandKitRepository, StoredBrandKit } from '../domain/ports'
import { createBrandKit } from '../../shared-kernel/brand-kit'
import { asBusinessId } from '../../shared-kernel/ids'
import { uuidv7 } from '../../shared-kernel/uuid'
import { asClient } from '@platform/db'

interface Row {
  business_id: string
  owner_type: 'store' | 'business'
  owner_id: string
  name: string
  logo_media_id: string | null
  palette: Record<string, string>
  typography: Record<string, string>
  voice: Record<string, unknown>
  ai_provenance: Record<string, never>
}

export class PgBrandKitRepository implements BrandKitRepository {
  async findByOwner(tx: Tx, ownerType: 'store' | 'business', ownerId: string): Promise<StoredBrandKit | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT business_id, owner_type, owner_id, name, logo_media_id, palette, typography, voice, ai_provenance
       FROM brand_kits WHERE owner_type = $1 AND owner_id = $2`,
      [ownerType, ownerId],
    )
    const row = rows[0]
    if (!row) return null
    const kit = createBrandKit({
      name: row.name,
      logoMediaId: row.logo_media_id,
      palette: row.palette,
      typography: row.typography,
      voice: row.voice as { tone?: string; keywords?: string[] },
      aiProvenance: row.ai_provenance,
    })
    if (!kit.ok) throw new Error(`corrupt brand_kits row for ${ownerType}/${ownerId}: ${kit.error.message}`)
    return { brandKit: kit.value, ownerType: row.owner_type, ownerId: row.owner_id, businessId: asBusinessId(row.business_id) }
  }

  /** VO semantics: the whole value is replaced (BLUEPRINT §2.4). */
  async upsert(tx: Tx, stored: StoredBrandKit): Promise<void> {
    const kit = stored.brandKit
    await asClient(tx).query(
      `INSERT INTO brand_kits (id, business_id, owner_type, owner_id, name, logo_media_id, palette, typography, voice, ai_provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (owner_type, owner_id) DO UPDATE SET
         name = EXCLUDED.name, logo_media_id = EXCLUDED.logo_media_id, palette = EXCLUDED.palette,
         typography = EXCLUDED.typography, voice = EXCLUDED.voice, ai_provenance = EXCLUDED.ai_provenance`,
      [uuidv7(), stored.businessId, stored.ownerType, stored.ownerId, kit.name, kit.logoMediaId,
       kit.palette, kit.typography, kit.voice, kit.aiProvenance],
    )
  }
}
