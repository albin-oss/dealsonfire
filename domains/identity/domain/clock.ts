/**
 * Clock port (P2). The platform's Clock lives outside domain-importable modules
 * (platform/clock is not types/events), so identity declares its own minimal port;
 * the composition root binds platform's SystemClock, which satisfies it structurally.
 * Window- and expiry-sensitive domain logic takes a Clock — never Date.now() directly.
 */
export interface Clock {
  now(): Date
}
