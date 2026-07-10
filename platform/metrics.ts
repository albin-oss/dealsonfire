/**
 * Metrics port (IMP-PLT-001 observability): counters, histograms, gauges as an interface —
 * a vendor adapter (StatsD/OTel/Vercel) plugs in without touching call sites. The in-memory
 * implementation doubles as the test assertion surface.
 */
export type MetricTags = Record<string, string>

export interface Metrics {
  increment(name: string, value?: number, tags?: MetricTags): void
  observe(name: string, value: number, tags?: MetricTags): void
  gauge(name: string, value: number, tags?: MetricTags): void
}

export class NoopMetrics implements Metrics {
  increment(): void {}
  observe(): void {}
  gauge(): void {}
}

export class InMemoryMetrics implements Metrics {
  readonly counters = new Map<string, number>()
  readonly observations = new Map<string, number[]>()
  readonly gauges = new Map<string, number>()

  private key(name: string, tags?: MetricTags): string {
    if (!tags || Object.keys(tags).length === 0) return name
    const suffix = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')
    return `${name}{${suffix}}`
  }

  increment(name: string, value = 1, tags?: MetricTags): void {
    const key = this.key(name, tags)
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  observe(name: string, value: number, tags?: MetricTags): void {
    const key = this.key(name, tags)
    const list = this.observations.get(key) ?? []
    list.push(value)
    this.observations.set(key, list)
  }

  gauge(name: string, value: number, tags?: MetricTags): void {
    this.gauges.set(this.key(name, tags), value)
  }
}
