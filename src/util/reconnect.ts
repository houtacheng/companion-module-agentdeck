/**
 * Reconnect backoff ladder (spec §7): 1s, 2s, 5s, 10s, 30s — capped at 30s.
 * Advances on each failed attempt, resets to the first rung on a successful
 * connect.
 */
export const RECONNECT_LADDER_MS: readonly number[] = [1000, 2000, 5000, 10000, 30000]

export class Backoff {
  private idx = 0

  reset(): void {
    this.idx = 0
  }

  /** Current delay, then advance toward the cap. */
  next(): number {
    const delay = RECONNECT_LADDER_MS[Math.min(this.idx, RECONNECT_LADDER_MS.length - 1)]
    if (this.idx < RECONNECT_LADDER_MS.length - 1) this.idx++
    return delay
  }
}
