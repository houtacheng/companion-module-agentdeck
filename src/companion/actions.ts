import type { CompanionActionDefinitions } from '@companion-module/base'
import { PROVIDER_IDS, PROVIDER_LABEL, type ProviderId } from '../agentdeck/mapper.js'
import type { AgentDeckInstance, SessionQuickActionKind } from '../main.js'

export const ACTION_IDS = {
  approveOnce: 'approve_once',
  approveSession: 'approve_session',
  reject: 'reject',
  enableAutoSelection: 'enable_auto_approval_selection',
  refreshSessions: 'refresh_sessions',
  navigateOptionUp: 'navigate_option_up',
  navigateOptionDown: 'navigate_option_down',
  selectHighlightedOption: 'select_highlighted_option',
  refreshUsage: 'refresh_usage',
  sessionGoOn: 'session_go_on',
  sessionCommit: 'session_commit',
  sessionClear: 'session_clear',
  sessionModel: 'session_model',
  sessionReview: 'session_review',
  sessionStop: 'session_stop',
  sessionEsc: 'session_esc',
  openClawGateway: 'openclaw_gateway',
  volumeUp: 'volume_up',
  volumeDown: 'volume_down',
  volumeMute: 'volume_mute',
  launchClaude: 'launch_claude',
  launchCodex: 'launch_codex',
  launchOpenClaw: 'launch_openclaw',
} as const

/** Per-provider "select this provider's approval" action id, e.g.
 *  `select_codex_approval`. Generated from PROVIDER_IDS rather than a
 *  hand-maintained record, so adding a provider needs no second edit here. */
export function selectApprovalActionId(provider: ProviderId): string {
  return `select_${provider}_approval`
}

export function buildActions(self: AgentDeckInstance): CompanionActionDefinitions {
  const defs: CompanionActionDefinitions = {
    [ACTION_IDS.approveOnce]: {
      name: 'Approve Once (active approval)',
      options: [],
      callback: async () => {
        await self.executeDecision('once')
      },
    },
    [ACTION_IDS.approveSession]: {
      name: 'Approve Session / Always (active approval)',
      options: [],
      callback: async () => {
        await self.executeDecision('session')
      },
    },
    [ACTION_IDS.reject]: {
      name: 'Reject (active approval)',
      options: [],
      callback: async () => {
        await self.executeDecision('reject')
      },
    },
    [ACTION_IDS.enableAutoSelection]: {
      name: 'Enable Auto Approval Selection',
      description: 'Clear any manual provider pin so the active approval follows the queue automatically.',
      options: [],
      callback: async () => {
        self.enableAutoApprovalSelection()
      },
    },
    [ACTION_IDS.refreshSessions]: {
      name: 'Refresh Sessions',
      description: 'Re-evaluate provider state, approval queue, variables and feedbacks from the current roster.',
      options: [],
      callback: async () => {
        self.refreshDerivedState()
      },
    },
    [ACTION_IDS.refreshUsage]: {
      name: 'Refresh Usage',
      description: 'Request a fresh usage snapshot from the daemon — mirrors pressing the official Stream Deck+ usage dial.',
      options: [],
      callback: async () => {
        self.refreshUsage()
      },
    },

    // Rotary option navigation — ports AgentDeck's Stream Deck+ dial pattern
    // (rotate to move a highlight, press to commit) to a managed session's
    // live multi-option prompt. Bind Up/Down to a preset's rotate_left /
    // rotate_right steps, and Select to its down step, for a dial-like feel
    // on any surface Companion can drive (including a real Stream Deck+).
    [ACTION_IDS.navigateOptionUp]: {
      name: 'Navigate Approval Option — Up (rotate)',
      description: 'Move the highlight up one option in the active approval\'s live option list.',
      options: [],
      callback: async () => {
        self.rotateApprovalOption('up')
      },
    },
    [ACTION_IDS.navigateOptionDown]: {
      name: 'Navigate Approval Option — Down (rotate)',
      description: 'Move the highlight down one option in the active approval\'s live option list.',
      options: [],
      callback: async () => {
        self.rotateApprovalOption('down')
      },
    },
    [ACTION_IDS.selectHighlightedOption]: {
      name: 'Select Highlighted Approval Option (press)',
      description: 'Commit the currently-highlighted option — the "press the dial" action.',
      options: [],
      callback: async () => {
        await self.selectHighlightedApprovalOption()
      },
    },
  }

  for (const p of PROVIDER_IDS) {
    defs[selectApprovalActionId(p)] = {
      name: `Select ${PROVIDER_LABEL[p]} Approval`,
      description: `Point the active approval at ${PROVIDER_LABEL[p]}'s earliest pending approval (no-op if none).`,
      options: [],
      callback: async () => {
        self.selectApprovalProvider(p)
      },
    }
  }

  // Session quick actions (official keypad presets: GO ON / REVIEW / COMMIT /
  // CLEAR / MODEL / STOP / ESC) — target a provider's active session, chosen
  // via a Provider dropdown since Companion has no single "focused session"
  // concept like the physical deck's detail view.
  const providerOption = {
    type: 'dropdown' as const,
    id: 'provider',
    label: 'Provider',
    default: 'claude' as string,
    choices: PROVIDER_IDS.map((p) => ({ id: p, label: PROVIDER_LABEL[p] })),
  }
  const quickActions: Array<{ id: string; kind: SessionQuickActionKind; name: string; description: string }> = [
    { id: ACTION_IDS.sessionGoOn, kind: 'go_on', name: 'Session: GO ON', description: 'Inject "go on" into the provider\'s active session.' },
    { id: ACTION_IDS.sessionCommit, kind: 'commit', name: 'Session: COMMIT', description: 'Inject "/commit" into the provider\'s active session.' },
    { id: ACTION_IDS.sessionClear, kind: 'clear', name: 'Session: CLEAR', description: 'Inject "/clear" into the provider\'s active session.' },
    { id: ACTION_IDS.sessionModel, kind: 'model', name: 'Session: MODEL', description: 'Inject "/model" into the provider\'s active session (opens the model switcher).' },
    { id: ACTION_IDS.sessionReview, kind: 'review', name: 'Session: REVIEW', description: 'Trigger an independent on-demand review of the active session\'s latest work.' },
    { id: ACTION_IDS.sessionStop, kind: 'stop', name: 'Session: STOP', description: 'Send Ctrl+C (interrupt) to the provider\'s active session.' },
    { id: ACTION_IDS.sessionEsc, kind: 'esc', name: 'Session: ESC', description: 'Send Esc (cancel prompt/selection) to the provider\'s active session.' },
  ]
  for (const qa of quickActions) {
    defs[qa.id] = {
      name: qa.name,
      description: qa.description,
      options: [providerOption],
      callback: async (action) => {
        self.sendSessionQuickAction(action.options.provider as ProviderId, qa.kind)
      },
    }
  }

  defs[ACTION_IDS.openClawGateway] = {
    name: 'OpenClaw: Open Gateway',
    description: 'Open OpenClaw\'s local browser dashboard (http://127.0.0.1:18789).',
    options: [],
    callback: async () => {
      self.openOpenClawGateway()
    },
  }

  // E1 Volume dial — local macOS system control, no daemon round trip.
  defs[ACTION_IDS.volumeUp] = {
    name: 'Volume Up',
    description: 'Raise macOS output volume (mirrors the official E1 dial rotate).',
    options: [{ type: 'number', id: 'step', label: 'Step', default: 5, min: 1, max: 25 }],
    callback: async (action) => {
      self.adjustSystemVolume(Math.abs(action.options.step as number))
    },
  }
  defs[ACTION_IDS.volumeDown] = {
    name: 'Volume Down',
    description: 'Lower macOS output volume (mirrors the official E1 dial rotate).',
    options: [{ type: 'number', id: 'step', label: 'Step', default: 5, min: 1, max: 25 }],
    callback: async (action) => {
      self.adjustSystemVolume(-Math.abs(action.options.step as number))
    },
  }
  defs[ACTION_IDS.volumeMute] = {
    name: 'Volume: Toggle Mute',
    description: 'Toggle macOS output mute (mirrors the official E1 dial press).',
    options: [],
    callback: async () => {
      self.toggleSystemMute()
    },
  }

  // E4 Launcher dial — verbatim fallback chains from upstream (app first,
  // web fallback if not installed).
  defs[ACTION_IDS.launchClaude] = {
    name: 'Launch: Claude',
    description: 'Open the Claude desktop app, or claude.ai if not installed.',
    options: [],
    callback: async () => {
      self.launchAgent('claude')
    },
  }
  defs[ACTION_IDS.launchCodex] = {
    name: 'Launch: Codex',
    description: 'Open the Codex desktop app, or ChatGPT Codex Cloud if not installed.',
    options: [],
    callback: async () => {
      self.launchAgent('codex')
    },
  }
  defs[ACTION_IDS.launchOpenClaw] = {
    name: 'Launch: OpenClaw',
    description: 'Open OpenClaw\'s local browser dashboard.',
    options: [],
    callback: async () => {
      self.launchAgent('openclaw')
    },
  }

  return defs
}
