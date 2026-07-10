/**
 * Clock port (IMP-PLT-001 shared contracts): injectable time so domains never call
 * Date.now() directly in logic that needs testing. Aggregates may still stamp wall-clock
 * facts; anything schedule- or window-sensitive takes a Clock.
 */
export interface Clock {
  now(): Date
  epochMs(): number
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
  epochMs(): number {
    return Date.now()
  }
}

/** Deterministic clock for tests and simulations. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime())
  }
  epochMs(): number {
    return this.current.getTime()
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
  set(to: Date): void {
    this.current = new Date(to.getTime())
  }
}
