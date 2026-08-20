import type { ProviderId } from '../agentdeck/mapper.js'
import type { PromptOption, PromptType } from '../agentdeck/protocol.js'

/**
 * OBSERVED ≠ ACTIONABLE (spec §41). A session waiting on permission does not
 * imply the module may answer it. Actionability is derived from concrete daemon
 * signals, fail-closed.
 */
export interface ApprovalCandidate {
  provider: ProviderId
  sessionId: string
  requestId?: string
  projectName?: string
  question?: string
  promptType?: PromptType
  options?: PromptOption[]
  controlMode?: 'managed' | 'observed'
  /** True only when the module can actually deliver a decision (spec §12). */
  actionable: boolean
  firstSeenAt: number
}

/**
 * Which of the three second-row buttons can act on a given candidate.
 *
 * VERIFIED against upstream: the PreToolUse permission gate
 * (`permission_decision`) accepts only `allow | deny` — there is NO "session /
 * always" at the gate. "Approve Always" exists solely for managed PTY prompts
 * whose promptType is `yes_no_always`, answered via `select_option` at the
 * always-option index. So `approveSession` is true only in that narrow case.
 */
export interface ApprovalCapabilities {
  approveOnce: boolean
  approveSession: boolean
  reject: boolean
}
