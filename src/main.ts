import {
  InstanceBase,
  InstanceStatus,
  type SomeCompanionConfigField,
} from '@companion-module/base'
import { getConfigFields, normalizeConfig, type ModuleConfig } from './config.js'
import { AgentDeckConnection } from './agentdeck/connection.js'
import { SessionStore } from './state/sessionStore.js'
import { ProviderRegistry } from './state/providerRegistry.js'
import { ApprovalCoordinator, type DecisionKind } from './approval/approvalCoordinator.js'
import type { SessionInfo, UsageEvent, OutgoingCommand } from './agentdeck/protocol.js'
import type { ProviderId } from './agentdeck/mapper.js'
import { buildVariableDefinitions, computeVariableValues } from './companion/variables.js'
import { buildFeedbacks, FEEDBACK_IDS, PET_FEEDBACK_IDS, USAGE_FEEDBACK_IDS, BLINK_FEEDBACK_IDS } from './companion/feedbacks.js'
import { buildActions } from './companion/actions.js'
import { buildPresets } from './companion/presets.js'
import { PET_FRAME_MS } from './companion/pet.js'
import { adjustVolume, toggleMute, openUrl, runLaunchTarget, LAUNCH_TARGETS } from './companion/system.js'
import { shouldWrapInSessionCommand, buildQuickActionCommand, type SessionQuickActionKind } from './companion/sessionRouting.js'

export type { SessionQuickActionKind }

export class AgentDeckInstance extends InstanceBase {
  config!: ModuleConfig
  readonly store = new SessionStore()
  readonly registry = new ProviderRegistry(this.store)
  readonly coordinator = new ApprovalCoordinator(this.store)
  private connection: AgentDeckConnection | null = null
  private petFrame = 0
  private petTimer: ReturnType<typeof setInterval> | null = null
  /** Latest usage_update payload (Claude 5h/7d/scoped + Codex rate limits).
   *  `null` until the first snapshot arrives, or after a disconnect
   *  invalidates it — the usage gauges render a dim "—" rather than trust a
   *  stale number (same fail-safe posture as the approval queue on reconnect). */
  private usage: UsageEvent | null = null

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = normalizeConfig(config as Partial<ModuleConfig>)

    this.setVariableDefinitions(buildVariableDefinitions())
    this.setFeedbackDefinitions(buildFeedbacks(this))
    this.setActionDefinitions(buildActions(this))
    this.rebuildPresets()

    this.updateStatus(InstanceStatus.Connecting)
    this.openConnection()
    this.refreshDerivedState()
    this.startPetAnimation()
  }

  async destroy(): Promise<void> {
    this.stopPetAnimation()
    this.connection?.stop(false)
    this.connection = null
  }

  async configUpdated(config: Record<string, unknown>): Promise<void> {
    this.config = normalizeConfig(config as Partial<ModuleConfig>)
    // Label may have changed → presets reference $(label:var).
    this.rebuildPresets()
    this.updateStatus(InstanceStatus.Connecting)
    this.openConnection()
    this.refreshDerivedState()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return getConfigFields()
  }

  // ===== connection wiring =====

  private openConnection(): void {
    this.connection?.stop(false)
    this.store.clear()
    this.coordinator.reset()

    const conn = new AgentDeckConnection(
      {
        host: this.config.host,
        port: this.config.port,
        token: this.config.token,
        reconnect: this.config.reconnect,
      },
      (level, message) => this.log(level, message),
    )
    this.connection = conn

    conn.on('connected', () => {
      this.updateStatus(InstanceStatus.Ok)
      this.refreshDerivedState()
    })

    conn.on('disconnected', () => {
      // Reconnect invalidation (spec §34): drop everything; no stale approvals
      // or usage numbers survive a reconnect.
      this.store.clear()
      this.coordinator.reset()
      this.usage = null
      this.updateStatus(
        this.config.reconnect ? InstanceStatus.Connecting : InstanceStatus.Disconnected,
      )
      this.refreshDerivedState()
      this.setVariableValues(computeVariableValues(this))
      this.checkFeedbacks(...(USAGE_FEEDBACK_IDS as [string, ...string[]]))
      this.checkFeedbacks(...(BLINK_FEEDBACK_IDS as [string, ...string[]]))
    })

    conn.on('usage_update', (usage: UsageEvent) => {
      this.usage = usage
      this.setVariableValues(computeVariableValues(this))
      this.checkFeedbacks(...(USAGE_FEEDBACK_IDS as [string, ...string[]]))
    })

    conn.on('stale-changed', (stale: boolean) => {
      if (stale) this.updateStatus(InstanceStatus.Connecting, 'Daemon quiet (stale)')
      else if (conn.isConnected()) this.updateStatus(InstanceStatus.Ok)
    })

    conn.on('sessions_list', (sessions: SessionInfo[]) => {
      this.store.replaceAll(sessions)
      this.refreshDerivedState()
    })

    conn.start()
  }

  isDaemonConnected(): boolean {
    return this.connection?.isConnected() ?? false
  }

  getUsage(): UsageEvent | null {
    return this.usage
  }

  /** Bound to the "Refresh Usage" action — mirrors the official dial's press. */
  refreshUsage(): void {
    if (!this.isDaemonConnected() || !this.connection) return
    this.connection.send({ type: 'query_usage' })
  }

  // ===== derived-state refresh =====

  /** Recompute approval queue + push variables + re-run feedbacks. Idempotent. */
  refreshDerivedState(): void {
    if (this.isDaemonConnected()) {
      this.coordinator.update()
    } else {
      this.coordinator.reset()
    }
    this.setVariableValues(computeVariableValues(this))
    this.checkFeedbacks(
      FEEDBACK_IDS.providerStatus,
      FEEDBACK_IDS.providerHasApproval,
      FEEDBACK_IDS.activeApprovalProvider,
      FEEDBACK_IDS.approvalActionAvailable,
      FEEDBACK_IDS.approvalCanNavigate,
    )
  }

  private rebuildPresets(): void {
    const { structure, presets } = buildPresets(this)
    this.setPresetDefinitions(structure, presets)
  }

  // ===== action helpers =====

  /**
   * Send a decision for the active approval, then wait for the daemon's own
   * sessions_list to confirm the gate cleared (spec §17.6 — no optimistic local
   * removal). Auto-advance happens on that next sessions_list.
   */
  async executeDecision(kind: DecisionKind): Promise<void> {
    if (!this.isDaemonConnected() || !this.connection) {
      this.log('warn', `${kind}: ignored — daemon not connected`)
      return
    }
    const active = this.coordinator.getActive()
    if (!active) {
      this.log('warn', `${kind}: ignored — no active approval`)
      return
    }
    if (!active.actionable) {
      this.log('warn', `${kind}: ignored — active approval is observed-only (not actionable)`)
      return
    }
    const command = this.coordinator.buildDecision(kind, active)
    if (!command) {
      this.log('warn', `${kind}: ignored — unsupported for this approval`)
      return
    }
    this.log('info', `approval decision sent: ${kind} → ${active.provider}/${active.sessionId}`)
    this.connection.send(command)
    // Do NOT mutate local queue here — the daemon's next sessions_list drives it.
  }

  selectApprovalProvider(provider: ProviderId): void {
    if (!this.isDaemonConnected()) return
    const ok = this.coordinator.selectProvider(provider)
    this.log('debug', `select provider ${provider}: ${ok ? 'switched' : 'no pending approval (unchanged)'}`)
    this.setVariableValues(computeVariableValues(this))
    this.checkFeedbacks(
      FEEDBACK_IDS.activeApprovalProvider,
      FEEDBACK_IDS.approvalActionAvailable,
    )
  }

  enableAutoApprovalSelection(): void {
    // Re-running update() with no pin recomputes the head-of-queue active.
    this.coordinator.reset()
    this.refreshDerivedState()
  }

  // ===== rotary option navigation (ports AgentDeck's Stream Deck+ dial: =====
  // ===== rotate to move a highlight, press to commit) =====

  /** Bound to a preset's rotate_left/rotate_right steps. */
  rotateApprovalOption(direction: 'up' | 'down'): void {
    if (!this.isDaemonConnected()) return
    const moved = this.coordinator.rotateOption(direction)
    if (!moved) return
    this.setVariableValues(computeVariableValues(this))
    this.checkFeedbacks(FEEDBACK_IDS.approvalCanNavigate)
  }

  /** Commit the highlighted option — the "press the dial" action. */
  async selectHighlightedApprovalOption(): Promise<void> {
    if (!this.isDaemonConnected() || !this.connection) {
      this.log('warn', 'select-highlighted: ignored — daemon not connected')
      return
    }
    const command = this.coordinator.buildSelectHighlighted()
    if (!command) {
      this.log('warn', 'select-highlighted: ignored — no navigable option list')
      return
    }
    this.log('info', `approval option selected: index=${this.coordinator.getCursorIndex()}`)
    this.connection.send(command)
    // Do NOT mutate local state — the daemon's next sessions_list drives it.
  }

  // ===== session quick actions (official GO ON / REVIEW / COMMIT / CLEAR / =====
  // ===== MODEL / STOP / ESC keypad presets, plugin.ts's sessionSlot switch) =====

  /** Route a command to a provider's active session, wrapping in
   *  `session_command` for anything the daemon can steer directly (managed
   *  bridges + observed sessions) and sending bare otherwise — mirrors
   *  upstream's `sendFocusedSessionCommand`. */
  private sendSessionCommand(session: SessionInfo, command: { type: string; [k: string]: unknown }): void {
    if (!this.connection) return
    if (shouldWrapInSessionCommand(session)) {
      this.connection.send({ type: 'session_command', sessionId: session.id, command } as OutgoingCommand)
    } else {
      this.connection.send(command as OutgoingCommand)
    }
  }

  sendSessionQuickAction(provider: ProviderId, kind: SessionQuickActionKind): void {
    if (!this.isDaemonConnected() || !this.connection) {
      this.log('warn', `${kind}: ignored — daemon not connected`)
      return
    }
    const state = this.registry.getProvider(provider)
    const session = state.sessions.find((s) => s.id === state.activeSessionId)
    if (!session) {
      this.log('warn', `${kind}: ignored — no active ${provider} session`)
      return
    }
    if (kind === 'review') {
      this.connection.send({ type: 'review_run', sessionId: session.id })
      this.log('info', `review_run sent → ${provider}/${session.id}`)
      return
    }
    this.sendSessionCommand(session, buildQuickActionCommand(kind))
    this.log('info', `${kind} sent → ${provider}/${session.id}`)
  }

  /** OpenClaw's GATEWAY quick action — opens its local browser dashboard. */
  openOpenClawGateway(): void {
    void openUrl('http://127.0.0.1:18789').catch((err) => this.log('warn', `open-gateway failed: ${String(err)}`))
  }

  // ===== E1 Volume dial / E4 Launcher dial (local macOS system control, =====
  // ===== no daemon round trip — ports plugin/src/actions/utility-dial.ts =====
  // ===== and launcher-dial.ts) =====

  adjustSystemVolume(deltaTicks: number): void {
    void adjustVolume(deltaTicks).catch((err) => this.log('warn', `volume adjust failed: ${String(err)}`))
  }

  toggleSystemMute(): void {
    void toggleMute().catch((err) => this.log('warn', `mute toggle failed: ${String(err)}`))
  }

  launchAgent(agent: keyof typeof LAUNCH_TARGETS): void {
    const target = LAUNCH_TARGETS[agent]
    if (!target) return
    void runLaunchTarget(target).catch((err) => this.log('warn', `launch ${agent} failed: ${String(err)}`))
  }

  // ===== pet animation =====

  getPetFrame(): number {
    return this.petFrame
  }

  private startPetAnimation(): void {
    this.stopPetAnimation()
    this.petTimer = setInterval(() => {
      this.petFrame = (this.petFrame + 1) % 100000
      // Only repaint the pets; cheap advanced-feedback re-eval.
      this.checkFeedbacks(...(PET_FEEDBACK_IDS as [string, ...string[]]))
      // Drive the approval-pending blink (boolean feedback — cheap even at 150ms).
      this.checkFeedbacks(...(BLINK_FEEDBACK_IDS as [string, ...string[]]))
    }, PET_FRAME_MS)
  }

  private stopPetAnimation(): void {
    if (this.petTimer) {
      clearInterval(this.petTimer)
      this.petTimer = null
    }
  }
}

// base 2.x registers the module via the entrypoint file's default export.
export default AgentDeckInstance
