/**
 * Location DTO (OPS-001 §6). Invisibility rule: the Ghost renders `ghost: true` so
 * callers can hide it while it is the only location — the merchant never meets the
 * word "location" before their second one (BLUEPRINT-003 §0.2).
 */
import type { Location } from '../domain/location'
import type { Address, LocationKind, LocationStatus } from '../domain/value-objects'

export interface LocationDTO {
  location_id: string
  business_id: string
  kind: LocationKind
  name: string
  address: Address | null
  pickup_instructions: string | null
  operating_window: { starts_at: string; ends_at: string; timezone: string } | null
  status: LocationStatus
  is_default: boolean
  /** System-authored AND merchant-untouched (persisted — D-39); UIs hide it while it is the only location. */
  ghost: boolean
}

export function locationToDTO(location: Location): LocationDTO {
  return {
    location_id: location.id,
    business_id: location.businessId,
    kind: location.kind,
    name: location.name,
    address: location.address,
    pickup_instructions: location.pickupInstructions,
    operating_window: location.operatingWindow
      ? {
          starts_at: location.operatingWindow.startsAt.toISOString(),
          ends_at: location.operatingWindow.endsAt.toISOString(),
          timezone: location.operatingWindow.timezone,
        }
      : null,
    status: location.status,
    is_default: location.isDefault,
    ghost: location.systemAuthored,
  }
}
