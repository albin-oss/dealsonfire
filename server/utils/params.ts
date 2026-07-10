/** Route-param decoding for human-named identifiers (option names carry spaces, e.g. "Roast level"). */
import { getRouterParam, type H3Event } from 'h3'

export function decodedParam(event: H3Event, name: string, maxLength: number): string | null {
  const raw = getRouterParam(event, name)
  if (!raw) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  const trimmed = decoded.trim()
  if (trimmed.length === 0 || trimmed.length > maxLength) return null
  return trimmed
}
