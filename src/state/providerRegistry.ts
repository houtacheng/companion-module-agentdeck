import type { SessionInfo } from '../agentdeck/protocol.js'
import { mapAgentType, PROVIDER_IDS, type ProviderId } from '../agentdeck/mapper.js'
import { mapSessionStatus, STATUS_PRIORITY, type ProviderStatus } from './stateMapper.js'
import type { SessionStore } from './sessionStore.js'

export interface ProviderState {
  id: ProviderId
  status: ProviderStatus
  sessionCount: number
  workingCount: number
  approvalCount: number
  sessions: SessionInfo[]
  activeSessionId?: string
  lastActivityAt?: number
  error?: string
}

function emptyProvider(id: ProviderId): ProviderState {
  return {
    id,
    status: 'offline',
    sessionCount: 0,
    workingCount: 0,
    approvalCount: 0,
    sessions: [],
  }
}

/**
 * Groups sessions by provider and aggregates them into ProviderState (spec §9).
 * Always returns a value for every `PROVIDER_IDS` entry — a provider with no
 * live sessions defaults to `offline` rather than being absent, so the
 * surface never blanks a slot.
 */
export class ProviderRegistry {
  constructor(private store: SessionStore) {}

  private buildAll(): Record<ProviderId, ProviderState> {
    const out = Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, emptyProvider(id)]),
    ) as Record<ProviderId, ProviderState>

    for (const session of this.store.all()) {
      const pid = mapAgentType(session.agentType)
      if (!pid) continue // non-surface agent type (e.g. 'monitor') — dropped
      const p = out[pid]
      p.sessions.push(session)
      p.sessionCount++

      const status = mapSessionStatus(session)
      if (status === 'working') p.workingCount++
      if (status === 'approval') p.approvalCount++
    }

    for (const pid of PROVIDER_IDS) {
      const p = out[pid]
      if (p.sessions.length === 0) continue

      // Stable slot order (spec: multiple concurrent sessions for one provider
      // must be individually addressable — see sessionSlot on the pet/tile
      // feedbacks). `sessions_list` order is the daemon's own and can reshuffle
      // tick to tick, so sort by startedAt (fallback: id) rather than trusting
      // array position — "Session 1" then means the same session across ticks.
      p.sessions.sort((a, b) => {
        const at = a.startedAt ? Date.parse(a.startedAt) : Number.POSITIVE_INFINITY
        const bt = b.startedAt ? Date.parse(b.startedAt) : Number.POSITIVE_INFINITY
        if (at !== bt) return at - bt
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })

      // Aggregate to the highest-priority status among the provider's sessions.
      let best: ProviderStatus = 'offline'
      let bestSession: SessionInfo | undefined
      for (const session of p.sessions) {
        const status = mapSessionStatus(session)
        if (STATUS_PRIORITY[status] > STATUS_PRIORITY[best]) {
          best = status
          bestSession = session
        }
      }
      p.status = best
      p.activeSessionId = bestSession?.id ?? p.sessions[0]?.id
    }

    return out
  }

  getAll(): Record<ProviderId, ProviderState> {
    return this.buildAll()
  }

  getProvider(id: ProviderId): ProviderState {
    return this.buildAll()[id]
  }
}
