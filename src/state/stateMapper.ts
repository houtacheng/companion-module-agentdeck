import type { SessionInfo } from '../agentdeck/protocol.js'

/**
 * Unified provider status. Central mapping lives here ONLY (spec §4) — never
 * re-derive state in feedbacks/actions.
 */
export type ProviderStatus =
  | 'offline'
  | 'idle'
  | 'working'
  | 'approval'
  | 'input'
  | 'review'
  | 'done'
  | 'error'

/**
 * Aggregation priority (spec §5). Higher wins when a provider has several
 * sessions in different states. `error` is highest; `offline` lowest.
 */
export const STATUS_PRIORITY: Record<ProviderStatus, number> = {
  error: 800,
  approval: 700,
  input: 600,
  review: 500,
  working: 400,
  done: 300,
  idle: 200,
  offline: 100,
}

/**
 * Map one AgentDeck session's wire state string → ProviderStatus.
 *
 * Verified against upstream `shared/src/states.ts` (lowercase wire values):
 *   disconnected → offline   idle → idle          processing → working
 *   awaiting_permission → approval   awaiting_diff → review   awaiting_option → input
 *
 * Fail-safe: a dead session (`alive === false`) or an unknown/missing state maps
 * to `offline` rather than guessing.
 */
export function mapSessionStatus(session: Pick<SessionInfo, 'state' | 'alive'>): ProviderStatus {
  if (session.alive === false) return 'offline'
  switch (session.state) {
    case 'processing':
      return 'working'
    case 'awaiting_permission':
      return 'approval'
    case 'awaiting_diff':
      return 'review'
    case 'awaiting_option':
      return 'input'
    case 'idle':
      return 'idle'
    case 'disconnected':
      return 'offline'
    default:
      return 'offline'
  }
}
