import type { SessionInfo, OutgoingCommand, PromptOption } from '../agentdeck/protocol.js'
import { mapAgentType, type ProviderId } from '../agentdeck/mapper.js'
import type { SessionStore } from '../state/sessionStore.js'
import type { ApprovalCandidate, ApprovalCapabilities } from './approvalTypes.js'

export type DecisionKind = 'once' | 'session' | 'reject'

/** Stable identity for a pending approval across rebuilds. */
function candidateKey(sessionId: string, requestId?: string): string {
  return `${sessionId}::${requestId ?? ''}`
}

/**
 * Label patterns that indicate an "approve for the whole session / always / don't
 * ask again" option in a managed `yes_no_always` prompt. Conservative on purpose
 * (spec §18 decision): Button 5 stays disabled unless one clearly matches.
 */
const ALWAYS_LABEL = /(always|session|don'?t ask|auto[- ]?approve|do not ask|for the rest)/i

function findAlwaysOptionIndex(options: PromptOption[] | undefined): number | undefined {
  if (!options) return undefined
  const hit = options.find((o) => typeof o.label === 'string' && ALWAYS_LABEL.test(o.label))
  return hit?.index
}

/**
 * Derive actionability from concrete daemon signals (spec §12, fail-closed).
 *
 *  - requestId present        → observed PreToolUse gate held open (allow/deny).
 *  - liveAnswerable === true   → daemon can inject / holds an ask-gate.
 *  - managed + options present → a live managed prompt we can answer.
 * Anything uncertain → false.
 */
function isActionable(s: SessionInfo): boolean {
  if (s.state !== 'awaiting_permission') return false
  if (typeof s.requestId === 'string' && s.requestId) return true
  if (s.liveAnswerable === true) return true
  if (s.controlMode === 'managed' && Array.isArray(s.options) && s.options.length > 0) return true
  return false
}

export class ApprovalCoordinator {
  private queue: ApprovalCandidate[] = []
  private activeKey: string | null = null
  /** Provider the user manually pinned via a first-row press; cleared when it runs dry. */
  private pinnedProvider: ProviderId | null = null
  /** firstSeenAt persistence keyed by candidateKey. */
  private firstSeen = new Map<string, number>()
  /**
   * Rotary cursor into the active candidate's `options[]` — ports AgentDeck's
   * Stream Deck+ dial pattern (rotate to move a highlight, press to commit) to
   * a managed session's live navigable/multi-option prompt (e.g. a Claude Code
   * AskUserQuestion list). Reset whenever the active candidate changes so a
   * leftover position from a previous prompt is never carried forward.
   */
  private cursorIndex = 0
  private cursorKey: string | null = null

  constructor(private store: SessionStore) {}

  /** Rebuild the queue + reconcile active selection. Call after each sessions_list. */
  update(now: number = Date.now()): void {
    const candidates: ApprovalCandidate[] = []
    const liveKeys = new Set<string>()

    for (const s of this.store.all()) {
      if (s.state !== 'awaiting_permission') continue
      const provider = mapAgentType(s.agentType)
      if (!provider) continue

      const key = candidateKey(s.id, s.requestId)
      liveKeys.add(key)
      const firstSeenAt = this.firstSeen.get(key) ?? now
      this.firstSeen.set(key, firstSeenAt)

      candidates.push({
        provider,
        sessionId: s.id,
        requestId: s.requestId,
        projectName: s.projectName,
        question: s.question,
        questionDetail: s.questionDetail,
        promptType: s.promptType,
        options: s.options,
        controlMode: s.controlMode,
        actionable: isActionable(s),
        firstSeenAt,
      })
    }

    // Prune firstSeen entries that are no longer pending.
    for (const key of [...this.firstSeen.keys()]) {
      if (!liveKeys.has(key)) this.firstSeen.delete(key)
    }

    // Ordering (spec §11): actionable first, then earliest firstSeenAt.
    candidates.sort((a, b) => {
      if (a.actionable !== b.actionable) return a.actionable ? -1 : 1
      return a.firstSeenAt - b.firstSeenAt
    })
    this.queue = candidates

    this.reconcileActive()
  }

  private reconcileActive(): void {
    const keys = new Set(this.queue.map((c) => candidateKey(c.sessionId, c.requestId)))

    // Keep current active if still pending.
    if (this.activeKey && keys.has(this.activeKey)) {
      this.reconcileCursor()
      return
    }

    // Active resolved/gone → auto-advance (spec §14).
    // If a provider is pinned and still has a candidate, advance within it;
    // otherwise clear the pin and fall to the head of the queue.
    if (this.pinnedProvider) {
      const next = this.earliestForProvider(this.pinnedProvider)
      if (next) {
        this.activeKey = candidateKey(next.sessionId, next.requestId)
        this.reconcileCursor()
        return
      }
      this.pinnedProvider = null
    }
    this.activeKey = this.queue[0]
      ? candidateKey(this.queue[0].sessionId, this.queue[0].requestId)
      : null
    this.reconcileCursor()
  }

  /** Reset the rotary cursor whenever the active candidate identity changes,
   *  and clamp it if the option list shrank between updates. */
  private reconcileCursor(): void {
    if (this.cursorKey !== this.activeKey) {
      this.cursorKey = this.activeKey
      this.cursorIndex = 0
    }
    const count = this.getActive()?.options?.length ?? 0
    if (count === 0) this.cursorIndex = 0
    else if (this.cursorIndex >= count) this.cursorIndex = count - 1
  }

  private earliestForProvider(provider: ProviderId): ApprovalCandidate | undefined {
    // queue is already actionable-first then earliest, so the first match wins.
    return this.queue.find((c) => c.provider === provider)
  }

  /**
   * Manual provider selection (spec §15). Point activeApproval at that provider's
   * earliest pending approval. If the provider has none, leave active unchanged.
   */
  selectProvider(provider: ProviderId): boolean {
    const next = this.earliestForProvider(provider)
    if (!next) return false
    this.pinnedProvider = provider
    this.activeKey = candidateKey(next.sessionId, next.requestId)
    return true
  }

  getQueue(): ApprovalCandidate[] {
    return this.queue
  }

  getActive(): ApprovalCandidate | null {
    if (!this.activeKey) return null
    return (
      this.queue.find((c) => candidateKey(c.sessionId, c.requestId) === this.activeKey) ?? null
    )
  }

  /** Number of pending approvals for a provider (for the ×N badge). */
  approvalCountForProvider(provider: ProviderId): number {
    return this.queue.filter((c) => c.provider === provider).length
  }

  /**
   * Capabilities of the active approval's second-row buttons.
   * Non-actionable → everything disabled (spec §32 fail-closed).
   */
  getCapabilities(candidate: ApprovalCandidate | null = this.getActive()): ApprovalCapabilities {
    if (!candidate || !candidate.actionable) {
      return { approveOnce: false, approveSession: false, reject: false }
    }
    // Approve Session/Always: only for a managed yes_no_always prompt that has a
    // clearly-labeled always option (conservative — spec §18).
    const approveSession =
      candidate.controlMode === 'managed' &&
      candidate.promptType === 'yes_no_always' &&
      findAlwaysOptionIndex(candidate.options) !== undefined
    return { approveOnce: true, approveSession, reject: true }
  }

  /**
   * Build the outgoing daemon command for a decision against the ACTIVE approval.
   * Returns null when not actionable or the decision is unsupported.
   *
   * Routing verified against upstream `peripheral-mapping.ts:commandForAction` +
   * daemon dispatch:
   *   requestId present (observed gate): permission_decision allow/deny
   *   no requestId (managed live prompt): select_option (approve) / escape (reject)
   */
  buildDecision(kind: DecisionKind, candidate: ApprovalCandidate | null = this.getActive()):
    | OutgoingCommand
    | null {
    if (!candidate) return null
    const caps = this.getCapabilities(candidate)
    if (kind === 'once' && !caps.approveOnce) return null
    if (kind === 'session' && !caps.approveSession) return null
    if (kind === 'reject' && !caps.reject) return null

    const { sessionId, requestId } = candidate

    if (kind === 'reject') {
      if (requestId) return { type: 'permission_decision', requestId, decision: 'deny' }
      return { type: 'session_command', sessionId, command: { type: 'escape' } }
    }

    if (kind === 'once') {
      if (requestId) return { type: 'permission_decision', requestId, decision: 'allow' }
      // Managed live prompt: the "yes" option is index 0.
      return { type: 'select_option', sessionId, index: 0, question: candidate.question }
    }

    // kind === 'session' — only reachable for managed yes_no_always (see caps).
    const alwaysIdx = findAlwaysOptionIndex(candidate.options)
    if (alwaysIdx === undefined) return null
    return { type: 'select_option', sessionId, index: alwaysIdx, question: candidate.question }
  }

  /**
   * Whether the active candidate has a live, navigable multi-option list a
   * rotary control can move through — a managed prompt with more than one
   * option (e.g. AskUserQuestion). Fail-closed like every other capability:
   * unless the daemon says this is actionable AND managed AND multi-option,
   * navigation is off (spec §32).
   */
  canNavigate(candidate: ApprovalCandidate | null = this.getActive()): boolean {
    if (!candidate || !candidate.actionable) return false
    return candidate.controlMode === 'managed' && (candidate.options?.length ?? 0) > 1
  }

  getCursorIndex(): number {
    return this.cursorIndex
  }

  /** Currently-highlighted option, or undefined when navigation isn't available. */
  getHighlightedOption(): PromptOption | undefined {
    if (!this.canNavigate()) return undefined
    return this.getActive()?.options?.[this.cursorIndex]
  }

  /** Rotate the highlight — the Companion-side analog of AgentDeck's Stream
   *  Deck+ dial rotation. No-op when navigation isn't available. */
  rotateOption(direction: 'up' | 'down'): boolean {
    if (!this.canNavigate()) return false
    const count = this.getActive()!.options!.length
    const delta = direction === 'down' ? 1 : -1
    this.cursorIndex = (this.cursorIndex + delta + count) % count
    return true
  }

  /** Commit the highlighted option — the Companion-side analog of pressing the
   *  dial. Returns null when navigation isn't available. */
  buildSelectHighlighted(): OutgoingCommand | null {
    const candidate = this.getActive()
    if (!this.canNavigate(candidate)) return null
    return {
      type: 'select_option',
      sessionId: candidate!.sessionId,
      index: this.cursorIndex,
      question: candidate!.question,
    }
  }

  /** Full reset — used on disconnect so no pre-disconnect approval survives (spec §34). */
  reset(): void {
    this.queue = []
    this.activeKey = null
    this.pinnedProvider = null
    this.firstSeen.clear()
    this.cursorIndex = 0
    this.cursorKey = null
  }
}
