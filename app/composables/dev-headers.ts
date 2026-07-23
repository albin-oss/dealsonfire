/**
 * The dev-identity header (Increment 04) — one idiom, previously copy-pasted across
 * seven files (and twice forgotten, breaking pages silently: 0.8 and Increment 02).
 * Session mode ignores it; dev mode requires it. One import ends the class of bug.
 */
import { devUserId } from './ignite/launch'

export function useDevHeaders(): Record<string, string> {
  return { 'x-dof-user-id': import.meta.client ? devUserId() : '' }
}
