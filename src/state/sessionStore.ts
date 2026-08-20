import type { SessionInfo } from '../agentdeck/protocol.js'

/**
 * Single source of truth for AgentDeck sessions inside this module (spec §8).
 * Fed exclusively from `sessions_list` events. No other component keeps a second
 * copy of session state.
 */
export class SessionStore {
  private sessions = new Map<string, SessionInfo>()

  /** Replace the whole roster from a `sessions_list` event. */
  replaceAll(sessions: SessionInfo[]): void {
    this.sessions.clear()
    for (const s of sessions) {
      if (s && typeof s.id === 'string' && s.id) this.sessions.set(s.id, s)
    }
  }

  /** Drop everything — used on disconnect so stale state can never be acted on. */
  clear(): void {
    this.sessions.clear()
  }

  all(): SessionInfo[] {
    return [...this.sessions.values()]
  }

  get(id: string): SessionInfo | undefined {
    return this.sessions.get(id)
  }

  get size(): number {
    return this.sessions.size
  }
}
