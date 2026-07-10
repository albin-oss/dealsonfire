/** Minimal class combiner — the design system's only class utility (no runtime deps). */
export type ClassValue = string | false | null | undefined | Record<string, boolean | undefined> | ClassValue[]

export function cx(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) {
      const nested = cx(...value)
      if (nested) out.push(nested)
    } else {
      for (const [key, on] of Object.entries(value)) if (on) out.push(key)
    }
  }
  return out.join(' ')
}
