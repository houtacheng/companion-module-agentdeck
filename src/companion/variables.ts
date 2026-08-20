import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import { PROVIDER_IDS, PROVIDER_LABEL, type ProviderId } from '../agentdeck/mapper.js'
import { formatResetTime } from './usageGauge.js'
import type { AgentDeckInstance } from '../main.js'

/** Object-map variable definitions (base 2.x shape: { id: { name } }). */
export function buildVariableDefinitions(): CompanionVariableDefinitions {
  const defs: CompanionVariableDefinitions = {
    agentdeck_connected: { name: 'Daemon connected (true/false)' },
    approval_provider: { name: 'Active approval — provider id' },
    approval_provider_name: { name: 'Active approval — provider name' },
    approval_project: { name: 'Active approval — project' },
    approval_question: { name: 'Active approval — question' },
    approval_type: { name: 'Active approval — prompt type' },
    approval_count: { name: 'Active approval — total pending' },
    approval_actionable: { name: 'Active approval — actionable (true/false)' },
    approval_can_once: { name: 'Active approval — Approve Once available' },
    approval_can_session: { name: 'Active approval — Approve Session available' },
    approval_can_reject: { name: 'Active approval — Reject available' },
    // Rotary option navigation (ports AgentDeck's Stream Deck+ dial pattern).
    approval_can_navigate: { name: 'Active approval — option list is navigable (rotary)' },
    approval_option_label: { name: 'Active approval — highlighted option label' },
    approval_option_index: { name: 'Active approval — highlighted option index (1-based)' },
    approval_option_count: { name: 'Active approval — total options' },
    // Usage gauges (official Stream Deck+ dial equivalent) — Claude 5h/7d/scoped
    // + Codex's 5h/7d-style rollout windows.
    claude_usage_5h_percent: { name: 'Claude 5H usage — used %' },
    claude_usage_5h_reset: { name: 'Claude 5H usage — reset countdown' },
    claude_usage_7d_percent: { name: 'Claude 7D usage — used %' },
    claude_usage_7d_reset: { name: 'Claude 7D usage — reset countdown' },
    claude_usage_scoped_label: { name: 'Claude scoped cap — model label (e.g. Fable)' },
    claude_usage_scoped_percent: { name: 'Claude scoped cap — used %' },
    claude_usage_scoped_reset: { name: 'Claude scoped cap — reset countdown' },
    codex_usage_5h_percent: { name: 'Codex 5H-style usage — used %' },
    codex_usage_5h_reset: { name: 'Codex 5H-style usage — reset countdown' },
    codex_usage_7d_percent: { name: 'Codex 7D-style usage — used %' },
    codex_usage_7d_reset: { name: 'Codex 7D-style usage — reset countdown' },
    usage_known: { name: 'Any usage snapshot received yet (true/false)' },
  }
  for (const p of PROVIDER_IDS) {
    const L = PROVIDER_LABEL[p]
    defs[`${p}_status`] = { name: `${L} — status` }
    defs[`${p}_session_count`] = { name: `${L} — session count` }
    defs[`${p}_working_count`] = { name: `${L} — working count` }
    defs[`${p}_approval_count`] = { name: `${L} — approval count` }
    defs[`${p}_active_project`] = { name: `${L} — active project` }
    // Active session detail (the provider's highest-priority session).
    defs[`${p}_model`] = { name: `${L} — active model` }
    defs[`${p}_effort`] = { name: `${L} — active effort level` }
    defs[`${p}_tool`] = { name: `${L} — current tool` }
    defs[`${p}_activity`] = { name: `${L} — activity` }
    defs[`${p}_context_percent`] = { name: `${L} — context used %` }
    defs[`${p}_total_tokens`] = { name: `${L} — total tokens` }
    defs[`${p}_elapsed`] = { name: `${L} — elapsed (active session)` }
  }
  return defs
}

/** Seconds → "H:MM:SS" or "M:SS". Empty for undefined. */
function fmtElapsed(sec: number | undefined): string {
  if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) return ''
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function computeVariableValues(self: AgentDeckInstance): CompanionVariableValues {
  const values: CompanionVariableValues = {}
  const connected = self.isDaemonConnected()
  values.agentdeck_connected = connected ? 'true' : 'false'

  const all = self.registry.getAll()
  for (const p of PROVIDER_IDS) {
    const state = all[p]
    // When the daemon is offline everything reads OFFLINE regardless of last roster.
    const status = connected ? state.status : 'offline'
    values[`${p}_status`] = status.toUpperCase()
    values[`${p}_session_count`] = connected ? state.sessionCount : 0
    values[`${p}_working_count`] = connected ? state.workingCount : 0
    values[`${p}_approval_count`] = connected ? self.coordinator.approvalCountForProvider(p) : 0

    const active = connected
      ? state.sessions.find((s) => s.id === state.activeSessionId)
      : undefined
    values[`${p}_active_project`] = active?.projectName ?? ''
    values[`${p}_model`] = active?.modelName ?? ''
    values[`${p}_effort`] = active?.effortLevel ?? ''
    values[`${p}_tool`] = active?.currentTool ?? ''
    values[`${p}_activity`] = active?.activity ?? active?.currentTask ?? active?.goal ?? ''
    values[`${p}_context_percent`] =
      typeof active?.contextPercent === 'number' ? Math.round(active.contextPercent) : ''
    values[`${p}_total_tokens`] =
      typeof active?.totalTokens === 'number' ? active.totalTokens : ''
    values[`${p}_elapsed`] = fmtElapsed(active?.elapsedSec)
  }

  const active = connected ? self.coordinator.getActive() : null
  const caps = self.coordinator.getCapabilities(active)
  const provider = (active?.provider ?? '') as ProviderId | ''
  values.approval_provider = provider
  values.approval_provider_name = provider ? PROVIDER_LABEL[provider] : ''
  values.approval_project = active?.projectName ?? ''
  values.approval_question = active?.question ?? ''
  values.approval_type = active?.promptType ?? ''
  values.approval_count = connected ? self.coordinator.getQueue().length : 0
  values.approval_actionable = active?.actionable ? 'true' : 'false'
  values.approval_can_once = caps.approveOnce ? 'true' : 'false'
  values.approval_can_session = caps.approveSession ? 'true' : 'false'
  values.approval_can_reject = caps.reject ? 'true' : 'false'

  const canNavigate = connected && self.coordinator.canNavigate(active)
  values.approval_can_navigate = canNavigate ? 'true' : 'false'
  const highlighted = canNavigate ? self.coordinator.getHighlightedOption() : undefined
  values.approval_option_label = highlighted?.label ?? ''
  values.approval_option_index = canNavigate ? self.coordinator.getCursorIndex() + 1 : ''
  values.approval_option_count = canNavigate ? (active?.options?.length ?? 0) : ''

  const usage = self.getUsage()
  values.usage_known = usage !== null ? 'true' : 'false'
  values.claude_usage_5h_percent = usage?.fiveHourPercent !== undefined ? Math.round(usage.fiveHourPercent) : ''
  values.claude_usage_5h_reset = formatResetTime(usage?.fiveHourResetsAt)
  values.claude_usage_7d_percent = usage?.sevenDayPercent !== undefined ? Math.round(usage.sevenDayPercent) : ''
  values.claude_usage_7d_reset = formatResetTime(usage?.sevenDayResetsAt)
  const scoped = usage?.scopedLimits?.[0]
  values.claude_usage_scoped_label = scoped?.label ?? ''
  values.claude_usage_scoped_percent = scoped ? Math.round(scoped.percent) : ''
  values.claude_usage_scoped_reset = formatResetTime(scoped?.resetsAt)
  const codex5h = usage?.codexRateLimits?.primary
  const codex7d = usage?.codexRateLimits?.secondary
  values.codex_usage_5h_percent = codex5h ? Math.round(codex5h.usedPercent) : ''
  values.codex_usage_5h_reset = formatResetTime(codex5h?.resetsAt)
  values.codex_usage_7d_percent = codex7d ? Math.round(codex7d.usedPercent) : ''
  values.codex_usage_7d_reset = formatResetTime(codex7d?.resetsAt)

  return values
}
