import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { PROVIDER_IDS, PROVIDER_LABEL, type ProviderId } from '../agentdeck/mapper.js'
import { ACTION_IDS, selectApprovalActionId } from './actions.js'
import { FEEDBACK_IDS, petFeedbackId, tileFeedbackId, USAGE_METRICS } from './feedbacks.js'
import { BAIMI_NAME } from './baimi-frames.generated.js'
import type { AgentDeckInstance } from '../main.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const DARK = combineRgb(20, 20, 20)

export interface PresetsResult {
  structure: CompanionPresetSection[]
  presets: CompanionPresetDefinitions
}

/**
 * The fixed 2x3 AI Control Surface (spec §22):
 *   Row 1: CODEX | CLAUDE | GEMINI  (status + provider selector)
 *   Row 2: ONCE  | SESSION | REJECT (act on the global active approval)
 */
export function buildPresets(self: AgentDeckInstance): PresetsResult {
  const v = (name: string) => `$(${self.label}:${name})`
  const presets: CompanionPresetDefinitions = {}

  // ---- Row 1: provider status buttons ----
  for (const p of PROVIDER_IDS) {
    presets[`${p}_status`] = {
      type: 'simple',
      name: `${PROVIDER_LABEL[p]} Status`,
      style: {
        text: `${PROVIDER_LABEL[p]}\n${v(`${p}_status`)}`,
        size: '14',
        color: WHITE,
        bgcolor: DARK,
      },
      steps: [
        {
          down: [{ actionId: selectApprovalActionId(p), options: {} }],
          up: [],
        },
      ],
      feedbacks: [
        // Working — active
        {
          feedbackId: FEEDBACK_IDS.providerStatus,
          options: { provider: p, status: 'working' },
          style: { bgcolor: combineRgb(0, 90, 130), color: WHITE },
        },
        // Approval — strong attention
        {
          feedbackId: FEEDBACK_IDS.providerStatus,
          options: { provider: p, status: 'approval' },
          style: { bgcolor: combineRgb(200, 120, 0), color: BLACK },
        },
        // Error
        {
          feedbackId: FEEDBACK_IDS.providerStatus,
          options: { provider: p, status: 'error' },
          style: { bgcolor: combineRgb(200, 0, 0), color: WHITE },
        },
        // Active-approval emphasis (thin marker via text color)
        {
          feedbackId: FEEDBACK_IDS.activeApprovalProvider,
          options: { provider: p },
          style: { color: combineRgb(255, 220, 0) },
        },
        // Blink: while anything is waiting on you (approval / question /
        // review), alternates on/off every ~450ms —
        // "on" beat flashes red over the amber approval style above, "off"
        // beat lets the amber show through, reading as a flashing button.
        {
          feedbackId: FEEDBACK_IDS.providerApprovalBlink,
          options: { provider: p },
          style: { bgcolor: combineRgb(255, 60, 60), color: WHITE },
        },
      ],
    }
  }

  // ---- Row 2: global approval action buttons ----
  const row2: Array<{
    id: string
    name: string
    glyph: string
    tail: string
    action: string
    capAction: 'once' | 'session' | 'reject'
    okColor: number
  }> = [
    { id: 'approve_once', name: 'Approve Once', glyph: '✓', tail: 'ONCE', action: ACTION_IDS.approveOnce, capAction: 'once', okColor: combineRgb(0, 120, 40) },
    { id: 'approve_session', name: 'Approve Session', glyph: '✓∞', tail: 'SESSION', action: ACTION_IDS.approveSession, capAction: 'session', okColor: combineRgb(0, 100, 90) },
    { id: 'reject', name: 'Reject', glyph: '✕', tail: 'REJECT', action: ACTION_IDS.reject, capAction: 'reject', okColor: combineRgb(160, 0, 0) },
  ]

  for (const b of row2) {
    presets[b.id] = {
      type: 'simple',
      name: b.name,
      style: {
        // No active approval → "— / NO / APPROVAL"; otherwise glyph + provider + tail.
        text: `${b.glyph} ${v('approval_provider_name')}\n${b.tail}`,
        size: '14',
        color: WHITE,
        bgcolor: DARK,
      },
      steps: [
        {
          down: [{ actionId: b.action, options: {} }],
          up: [],
        },
      ],
      feedbacks: [
        {
          feedbackId: FEEDBACK_IDS.approvalActionAvailable,
          options: { action: b.capAction },
          style: { bgcolor: b.okColor, color: WHITE },
        },
      ],
    }
  }

  // ---- Animated pets (one per provider) ----
  const PET_NAME: Record<ProviderId, string> = {
    codex: 'Codex Pet (cloud, animated)',
    claude: 'Claude Pet (octopus, animated)',
    gemini: 'Gemini Pet (spark, animated)',
    openclaw: 'OpenClaw Pet (crayfish, animated)',
    opencode: 'OpenCode Pet (nested ring, animated)',
    antigravity: 'Antigravity Pet (rainbow mark, animated)',
    kiro: 'Kiro Pet (ghost placeholder, animated)',
  }
  for (const p of PROVIDER_IDS) {
    presets[`${p}_pet`] = {
      type: 'simple',
      name: PET_NAME[p],
      style: {
        // The advanced feedback paints the button image; keep text empty.
        text: '',
        size: '7',
        color: WHITE,
        bgcolor: combineRgb(11, 14, 26),
      },
      steps: [
        {
          // Pressing the pet selects that provider's approval (like the status key).
          down: [{ actionId: selectApprovalActionId(p), options: {} }],
          up: [],
        },
      ],
      // Codex's pet feedback has a `skin` option; supply its default explicitly
      // so the preset instantiates the feedback (an empty options object leaves
      // the required dropdown unset and the button renders blank). Same reason
      // sessionSlot is spelled out as 'active' rather than left implicit.
      feedbacks: [
        { feedbackId: petFeedbackId(p), options: { sessionSlot: 'active', ...(p === 'codex' ? { skin: 'default' } : {}) } },
      ],
    }
  }

  // ---- Rich session tiles (official AgentDeck look) ----
  for (const p of PROVIDER_IDS) {
    presets[`${p}_tile`] = {
      type: 'simple',
      name: `${PROVIDER_LABEL[p]} Tile (official look)`,
      style: { text: '', size: '7', color: WHITE, bgcolor: combineRgb(0, 0, 0) },
      steps: [
        { down: [{ actionId: selectApprovalActionId(p), options: {} }], up: [] },
      ],
      // Codex's tile feedback has a `skin` option; supply its default explicitly
      // so the preset instantiates the feedback (same reason as the pet preset).
      feedbacks: [
        { feedbackId: tileFeedbackId(p), options: { sessionSlot: 'active', ...(p === 'codex' ? { skin: 'default' } : {}) } },
      ],
    }
  }

  // ---- Session slot tiles/pets — for running MORE THAN ONE session of the
  // same provider at once. The default `${p}_tile`/`${p}_pet` above always
  // show the single highest-priority session ("Active"), so dragging that
  // preset twice for the same provider used to show two identical copies of
  // whichever session happened to be highest priority — this is what "Session
  // 1"/"Session 2" fix: each addresses a specific concurrent session
  // (ProviderRegistry sorts sessions by startedAt so the numbering is stable
  // tick to tick), the way the official Stream Deck grid gives each session
  // its own key. Two ready-made slots per provider; add more by dragging the
  // base preset and changing its feedback's Session dropdown past 2. ----
  const SESSION_SLOTS = 2
  for (const p of PROVIDER_IDS) {
    for (let slot = 0; slot < SESSION_SLOTS; slot++) {
      presets[`${p}_tile_session_${slot + 1}`] = {
        type: 'simple',
        name: `${PROVIDER_LABEL[p]} Tile — Session ${slot + 1}`,
        style: { text: '', size: '7', color: WHITE, bgcolor: combineRgb(0, 0, 0) },
        steps: [{ down: [{ actionId: selectApprovalActionId(p), options: {} }], up: [] }],
        feedbacks: [
          { feedbackId: tileFeedbackId(p), options: { sessionSlot: String(slot), ...(p === 'codex' ? { skin: 'default' } : {}) } },
        ],
      }
    }
  }

  // Codex's official-look tile with the custom avatar (白咪) skin.
  presets['codex_tile_baimi'] = {
    type: 'simple',
    name: `Codex Tile — ${BAIMI_NAME} (official look, custom)`,
    style: { text: '', size: '7', color: WHITE, bgcolor: combineRgb(0, 0, 0) },
    steps: [{ down: [{ actionId: selectApprovalActionId('codex'), options: {} }], up: [] }],
    feedbacks: [{ feedbackId: tileFeedbackId('codex'), options: { skin: 'baimi' } }],
  }

  // ---- Session info buttons (one per provider) ----
  for (const p of PROVIDER_IDS) {
    presets[`${p}_info`] = {
      type: 'simple',
      name: `${PROVIDER_LABEL[p]} Info`,
      style: {
        text:
          `${PROVIDER_LABEL[p]} $(${self.label}:${p}_status)\n` +
          `$(${self.label}:${p}_model)\n` +
          `$(${self.label}:${p}_activity)\n` +
          `$(${self.label}:${p}_elapsed)`,
        size: '7',
        color: WHITE,
        bgcolor: DARK,
        alignment: 'left:top',
      },
      steps: [
        { down: [{ actionId: selectApprovalActionId(p), options: {} }], up: [] },
      ],
      feedbacks: [
        {
          feedbackId: FEEDBACK_IDS.providerStatus,
          options: { provider: p, status: 'working' },
          style: { bgcolor: combineRgb(0, 90, 130), color: WHITE },
        },
        {
          feedbackId: FEEDBACK_IDS.providerStatus,
          options: { provider: p, status: 'approval' },
          style: { bgcolor: combineRgb(200, 120, 0), color: BLACK },
        },
        {
          feedbackId: FEEDBACK_IDS.providerStatus,
          options: { provider: p, status: 'error' },
          style: { bgcolor: combineRgb(200, 0, 0), color: WHITE },
        },
        {
          feedbackId: FEEDBACK_IDS.providerApprovalBlink,
          options: { provider: p },
          style: { bgcolor: combineRgb(255, 60, 60), color: WHITE },
        },
      ],
    }
  }

  // ---- Rotary option navigator (ports AgentDeck's Stream Deck+ dial pattern:
  // rotate to move a highlight through a live session's option list, press to
  // commit). Works on any surface Companion drives with rotary input (a real
  // Stream Deck+ via Companion, or a software rotary control); on a plain
  // button, bind the two Navigate actions to separate keys instead. ----
  presets['approval_navigate'] = {
    type: 'simple',
    name: 'Navigate Approval Option (rotary)',
    style: {
      text: `${v('approval_option_index')}/${v('approval_option_count')}\n${v('approval_option_label')}`,
      size: '7',
      color: WHITE,
      bgcolor: DARK,
      alignment: 'center:center',
    },
    steps: [
      {
        // Press = commit the highlighted option (the "press the dial" action).
        down: [{ actionId: ACTION_IDS.selectHighlightedOption, options: {} }],
        up: [],
        // Rotary input on a supporting surface (e.g. Stream Deck+ via Companion).
        rotate_left: [{ actionId: ACTION_IDS.navigateOptionUp, options: {} }],
        rotate_right: [{ actionId: ACTION_IDS.navigateOptionDown, options: {} }],
      },
    ],
    feedbacks: [
      {
        feedbackId: FEEDBACK_IDS.approvalCanNavigate,
        options: {},
        style: { bgcolor: combineRgb(80, 40, 160), color: WHITE },
      },
    ],
  }

  // Codex custom avatar (白咪) as a ready-to-use preset.
  presets['codex_pet_baimi'] = {
    type: 'simple',
    name: `Codex Pet — ${BAIMI_NAME} (custom)`,
    style: { text: '', size: '7', color: WHITE, bgcolor: combineRgb(11, 14, 26) },
    steps: [{ down: [{ actionId: selectApprovalActionId('codex'), options: {} }], up: [] }],
    feedbacks: [{ feedbackId: petFeedbackId('codex'), options: { skin: 'baimi' } }],
  }

  // ---- Usage gauges (official Stream Deck+ dial look). One preset per
  // metric as a convenient starting point, matching the screenshot (5H / 7D /
  // Scoped for Claude, 5H/7D-style for Codex) — but every instance uses the
  // SAME parameterized feedback, so after dragging one onto a button you can
  // freely change its "Metric" dropdown to any of the five windows (no code
  // change needed). Press refreshes the snapshot — mirrors the official
  // dial's press behaviour. ----
  const usageTiles = USAGE_METRICS.map((m) => ({ id: `usage_${m.id}`, name: `Usage — ${m.label}`, metric: m.id }))
  for (const t of usageTiles) {
    presets[t.id] = {
      type: 'simple',
      name: t.name,
      style: { text: '', size: '7', color: WHITE, bgcolor: combineRgb(15, 23, 42) },
      steps: [{ down: [{ actionId: ACTION_IDS.refreshUsage, options: {} }], up: [] }],
      feedbacks: [{ feedbackId: FEEDBACK_IDS.usageGauge, options: { metric: t.metric } }],
    }
  }

  // ---- Session quick actions (official keypad presets: GO ON / REVIEW /
  // COMMIT / CLEAR / MODEL / STOP / ESC). Each targets the "provider" option
  // baked into the preset instance — defaults to Claude; change it after
  // dragging the preset onto a button to point at a different provider. ----
  const quickActionTiles: Array<{ id: string; label: string; actionId: string; color: number }> = [
    { id: 'session_go_on', label: 'GO ON', actionId: ACTION_IDS.sessionGoOn, color: combineRgb(30, 58, 47) },
    { id: 'session_review', label: 'REVIEW', actionId: ACTION_IDS.sessionReview, color: combineRgb(30, 41, 59) },
    { id: 'session_commit', label: 'COMMIT', actionId: ACTION_IDS.sessionCommit, color: combineRgb(30, 41, 59) },
    { id: 'session_clear', label: 'CLEAR', actionId: ACTION_IDS.sessionClear, color: combineRgb(30, 41, 59) },
    { id: 'session_model', label: 'MODEL', actionId: ACTION_IDS.sessionModel, color: combineRgb(45, 31, 61) },
    { id: 'session_stop', label: 'STOP', actionId: ACTION_IDS.sessionStop, color: combineRgb(80, 20, 20) },
    { id: 'session_esc', label: 'ESC', actionId: ACTION_IDS.sessionEsc, color: combineRgb(50, 50, 50) },
  ]
  for (const t of quickActionTiles) {
    presets[t.id] = {
      type: 'simple',
      name: `Session: ${t.label}`,
      style: { text: t.label, size: '14', color: WHITE, bgcolor: t.color },
      steps: [{ down: [{ actionId: t.actionId, options: { provider: 'claude' } }], up: [] }],
      feedbacks: [],
    }
  }
  presets['openclaw_gateway'] = {
    type: 'simple',
    name: 'OpenClaw: Open Gateway',
    style: { text: 'GATEWAY', size: '14', color: combineRgb(192, 132, 252), bgcolor: combineRgb(26, 15, 46) },
    steps: [{ down: [{ actionId: ACTION_IDS.openClawGateway, options: {} }], up: [] }],
    feedbacks: [],
  }

  // ---- E1 Volume dial / E4 Launcher dial (local macOS system control) ----
  presets['volume_up'] = {
    type: 'simple',
    name: 'Volume Up',
    style: { text: 'VOL\n+', size: '14', color: WHITE, bgcolor: DARK },
    steps: [{ down: [{ actionId: ACTION_IDS.volumeUp, options: { step: 5 } }], up: [], rotate_right: [{ actionId: ACTION_IDS.volumeUp, options: { step: 5 } }] }],
    feedbacks: [],
  }
  presets['volume_down'] = {
    type: 'simple',
    name: 'Volume Down',
    style: { text: 'VOL\n−', size: '14', color: WHITE, bgcolor: DARK },
    steps: [{ down: [{ actionId: ACTION_IDS.volumeDown, options: { step: 5 } }], up: [], rotate_left: [{ actionId: ACTION_IDS.volumeDown, options: { step: 5 } }] }],
    feedbacks: [],
  }
  presets['volume_mute'] = {
    type: 'simple',
    name: 'Volume: Toggle Mute',
    style: { text: 'MUTE', size: '14', color: WHITE, bgcolor: DARK },
    steps: [{ down: [{ actionId: ACTION_IDS.volumeMute, options: {} }], up: [] }],
    feedbacks: [],
  }
  const launcherTiles: Array<{ id: string; label: string; actionId: string }> = [
    { id: 'launch_claude', label: 'LAUNCH\nCLAUDE', actionId: ACTION_IDS.launchClaude },
    { id: 'launch_codex', label: 'LAUNCH\nCODEX', actionId: ACTION_IDS.launchCodex },
    { id: 'launch_openclaw', label: 'LAUNCH\nOPENCLAW', actionId: ACTION_IDS.launchOpenClaw },
  ]
  for (const t of launcherTiles) {
    presets[t.id] = {
      type: 'simple',
      name: t.id,
      style: { text: t.label, size: '14', color: combineRgb(224, 231, 255), bgcolor: combineRgb(30, 27, 75) },
      steps: [{ down: [{ actionId: t.actionId, options: {} }], up: [] }],
      feedbacks: [],
    }
  }

  // Providers beyond the fixed 2x3 core (spec's original three: Codex / Claude
  // / Gemini). AgentDeck also supports OpenClaw, OpenCode, Antigravity, and
  // Kiro — each gets the same status/tile/info/pet presets, just not a slot
  // in the fixed 2x3 grid, whose layout is a deliberate design constant.
  const EXTRA_PROVIDERS: ProviderId[] = PROVIDER_IDS.filter(
    (p) => p !== 'codex' && p !== 'claude' && p !== 'gemini',
  )

  const structure: CompanionPresetSection[] = [
    {
      id: 'ai_control_surface',
      name: 'AI Control Surface',
      description:
        'Fixed 2x3 surface — Row 1: Codex / Claude / Gemini status (press to select that provider\'s approval). ' +
        'Row 2: Approve Once / Approve Session / Reject the global active approval.',
      definitions: [
        'codex_status',
        'claude_status',
        'gemini_status',
        'approve_once',
        'approve_session',
        'reject',
      ],
    },
    {
      id: 'extended_providers',
      name: 'Additional Providers (Status)',
      description:
        'Status keys for every other AgentDeck-supported agent — OpenClaw, OpenCode, Antigravity, ' +
        'Kiro. Not part of the fixed 2x3 core; drag onto any page to build a larger surface. Each ' +
        'still feeds the same global approval queue and Row 2 buttons.',
      definitions: EXTRA_PROVIDERS.map((p) => `${p}_status`),
    },
    {
      id: 'usage_gauges',
      name: 'Usage (official Stream Deck+ look)',
      description:
        'Full-bleed usage gauges — the same 5H / 7D / scoped-model-cap keys as the official Stream Deck+ ' +
        'dials (severity ramp: green ≤50%, amber 50–80%, red >80%). Press to refresh. Every gauge shares ' +
        'one feedback with a "Metric" dropdown — after dragging a preset onto a button, change its Metric ' +
        'option to any of the five windows freely; these five presets are just convenient starting points.',
      definitions: usageTiles.map((t) => t.id),
    },
    {
      id: 'session_tiles',
      name: 'Session Tiles (official look)',
      description: 'Full-tile status keys matching the official AgentDeck Stream Deck design, for every provider.',
      definitions: [...PROVIDER_IDS.map((p) => `${p}_tile`), 'codex_tile_baimi'],
    },
    {
      id: 'session_slots',
      name: 'Session Slots (multiple sessions per provider)',
      description:
        'For running more than one session of the same provider at once — the base Tile preset always ' +
        'shows the single highest-priority ("Active") session, so multiple copies of it look identical. ' +
        'These address a specific concurrent session via the feedback\'s "Session" dropdown (numbered ' +
        'stably by start time). Two slots per provider here; drag the base Tile preset and bump its ' +
        'Session option for a third or beyond.',
      definitions: PROVIDER_IDS.flatMap((p) => Array.from({ length: 2 }, (_, i) => `${p}_tile_session_${i + 1}`)),
    },
    {
      id: 'session_info',
      name: 'Session Info',
      description: 'Per-provider info keys: status, model, activity, elapsed.',
      definitions: PROVIDER_IDS.map((p) => `${p}_info`),
    },
    {
      id: 'pets',
      name: 'Pets',
      description: 'Animated agent creatures that react to status.',
      definitions: [...PROVIDER_IDS.map((p) => `${p}_pet`), 'codex_pet_baimi'],
    },
    {
      id: 'session_quick_actions',
      name: 'Session Quick Actions',
      description:
        'The official keypad detail-view presets — GO ON / REVIEW / COMMIT / CLEAR / MODEL / STOP / ESC — ' +
        'plus OpenClaw\'s GATEWAY key. Each targets a provider\'s active session; change the preset\'s ' +
        '"Provider" option after dragging it onto a button to point at a different agent.',
      definitions: [...quickActionTiles.map((t) => t.id), 'openclaw_gateway'],
    },
    {
      id: 'system_controls',
      name: 'System (Volume / Launcher)',
      description:
        'Local macOS controls from the official Stream Deck+ encoders — E1 Volume (adjust/mute) and ' +
        'E4 Launcher (open Claude / Codex / OpenClaw). No AgentDeck daemon round trip.',
      definitions: ['volume_up', 'volume_down', 'volume_mute', ...launcherTiles.map((t) => t.id)],
    },
    {
      id: 'rotary_control',
      name: 'Rotary Control (Navigate Options)',
      description:
        'Ports AgentDeck\'s Stream Deck+ dial pattern: rotate to move a highlight through the ' +
        'active approval\'s live option list, press to commit. Only lights up for a managed, ' +
        'multi-option prompt (e.g. an AskUserQuestion list) — never for a plain yes/no gate.',
      definitions: ['approval_navigate'],
    },
  ]

  return { structure, presets }
}
