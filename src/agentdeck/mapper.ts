import type { AgentType } from './protocol.js'

/**
 * Every AgentDeck-supported coding agent this module surfaces a provider row
 * for. Verified against upstream `shared/src/adapter.ts`'s `AgentType` union:
 *   'claude-code' | 'openclaw' | 'codex-cli' | 'codex-app' | 'opencode'
 *   | 'antigravity' | 'kiro-cli' | 'kiro-ide' | 'monitor'
 * `monitor` is deliberately excluded — it is a usage-only observation mode,
 * not an interactive coding agent with sessions to approve/reject. `gemini`
 * has no adapter in AgentDeck yet (see mapAgentType) but the slot is kept so
 * the module doesn't need another breaking change once upstream ships one.
 */
export type ProviderId = 'codex' | 'claude' | 'gemini' | 'openclaw' | 'opencode' | 'antigravity' | 'kiro'

export const PROVIDER_IDS: readonly ProviderId[] = [
  'codex',
  'claude',
  'gemini',
  'openclaw',
  'opencode',
  'antigravity',
  'kiro',
] as const

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  codex: 'CODEX',
  claude: 'CLAUDE',
  gemini: 'GEMINI',
  openclaw: 'OPENCLAW',
  opencode: 'OPENCODE',
  antigravity: 'ANTIGRAVITY',
  kiro: 'KIRO',
}

/**
 * Map an AgentDeck AgentType to a surface provider.
 *
 * IMPORTANT (verified against upstream `shared/src/adapter.ts`): the AgentType
 * union has NO `gemini` / `gemini-cli` today — those cases are kept for
 * forward-compat and simply never fire until upstream ships a Gemini adapter,
 * so the Gemini slot stays OFFLINE. `codex-cli`/`codex-app` fold into one
 * `codex` row and `kiro-cli`/`kiro-ide` into one `kiro` row, matching how
 * upstream's own UI treats each pair as one product. `monitor` maps to
 * undefined on purpose (spec §38-style exclusion) — it is not a row.
 */
export function mapAgentType(agentType: string | undefined): ProviderId | undefined {
  switch (agentType) {
    case 'codex-cli':
    case 'codex-app':
      return 'codex'
    case 'claude-code':
      return 'claude'
    case 'gemini':
    case 'gemini-cli':
      return 'gemini'
    case 'openclaw':
      return 'openclaw'
    case 'opencode':
      return 'opencode'
    case 'antigravity':
      return 'antigravity'
    case 'kiro-cli':
    case 'kiro-ide':
      return 'kiro'
    default:
      return undefined
  }
}
