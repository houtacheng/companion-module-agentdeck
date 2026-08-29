import type { AgentType } from './protocol.js'

/**
 * Every AgentDeck-supported coding agent this module surfaces a provider row
 * for. Verified against upstream `shared/src/adapter.ts`'s `AgentType` union:
 *   'claude-code' | 'openclaw' | 'codex-cli' | 'codex-app' | 'opencode'
 *   | 'antigravity' | 'kiro-cli' | 'kiro-ide' | 'monitor'
 * `monitor` is deliberately excluded — it is a usage-only observation mode,
 * not an interactive coding agent with sessions to approve/reject. Gemini has
 * no adapter in AgentDeck (no `gemini`/`gemini-cli` case in the AgentType
 * union upstream), so there is no provider row for it — a permanently-OFFLINE
 * slot would only confuse users. Re-add it if upstream ever ships one.
 */
export type ProviderId = 'codex' | 'claude' | 'openclaw' | 'opencode' | 'antigravity' | 'kiro'

export const PROVIDER_IDS: readonly ProviderId[] = [
  'codex',
  'claude',
  'openclaw',
  'opencode',
  'antigravity',
  'kiro',
] as const

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  codex: 'CODEX',
  claude: 'CLAUDE',
  openclaw: 'OPENCLAW',
  opencode: 'OPENCODE',
  antigravity: 'ANTIGRAVITY',
  kiro: 'KIRO',
}

/**
 * Map an AgentDeck AgentType to a surface provider.
 *
 * IMPORTANT (verified against upstream `shared/src/adapter.ts`): the AgentType
 * union has no `gemini`/`gemini-cli` case, so there is no Gemini mapping here.
 * `codex-cli`/`codex-app` fold into one `codex` row and `kiro-cli`/`kiro-ide`
 * into one `kiro` row, matching how upstream's own UI treats each pair as one
 * product. `monitor` maps to undefined on purpose (spec §38-style exclusion)
 * — it is not a row.
 */
export function mapAgentType(agentType: string | undefined): ProviderId | undefined {
  switch (agentType) {
    case 'codex-cli':
    case 'codex-app':
      return 'codex'
    case 'claude-code':
      return 'claude'
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
