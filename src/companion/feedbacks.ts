import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { PROVIDER_IDS, PROVIDER_LABEL, type ProviderId } from '../agentdeck/mapper.js'
import type { ProviderStatus } from '../state/stateMapper.js'
import { renderPet } from './pet.js'
import { renderBaimi } from './baimi.js'
import { renderTile } from './tile.js'
import { renderUsageGauge } from './usageGauge.js'
import { BAIMI_NAME } from './baimi-frames.generated.js'
import { isBlinkOnBeat, needsYourResponse } from './blink.js'
import type { AgentDeckInstance } from '../main.js'

// Re-exported for backward compat (tests + any external import of these from
// feedbacks.ts) — the actual definitions live in blink.js so pet.ts/tile.ts
// can share them without a circular import.
export { isBlinkOnBeat, needsYourResponse, BLINK_HALF_CYCLE_FRAMES } from './blink.js'

const TITLE_NAME: Record<ProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
  openclaw: 'OpenClaw',
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  kiro: 'Kiro',
}

export const FEEDBACK_IDS = {
  providerStatus: 'provider_status',
  providerHasApproval: 'provider_has_approval',
  activeApprovalProvider: 'active_approval_provider',
  approvalActionAvailable: 'approval_action_available',
  approvalCanNavigate: 'approval_can_navigate',
  usageGauge: 'usage_gauge',
  providerApprovalBlink: 'provider_approval_blink',
} as const

/** The usage-gauge feedback id, ticked whenever a usage_update arrives
 *  or on disconnect (to blank back to the dim "—" unknown state). */
export const USAGE_FEEDBACK_IDS = [FEEDBACK_IDS.usageGauge]

/** Ticked on the pet-animation timer (every PET_FRAME_MS) to drive the
 *  approval-pending blink. */
export const BLINK_FEEDBACK_IDS = [FEEDBACK_IDS.providerApprovalBlink]

/** Every window a usage gauge button can show — freely chosen per button via
 *  the feedback's own "Metric" dropdown option, rather than baked into a
 *  separate feedback per window. */
export const USAGE_METRICS = [
  { id: 'claude_5h', label: 'Claude — 5H window' },
  { id: 'claude_7d', label: 'Claude — 7D window' },
  { id: 'claude_scoped', label: 'Claude — Scoped model cap (e.g. Fable)' },
  { id: 'codex_5h', label: 'Codex — 5H-style window' },
  { id: 'codex_7d', label: 'Codex — 7D-style window' },
] as const
export type UsageMetricId = (typeof USAGE_METRICS)[number]['id']

/** Per-provider animated pet feedback id, e.g. `codex_pet`. */
export function petFeedbackId(provider: ProviderId): string {
  return `${provider}_pet`
}

/** Per-provider rich-tile feedback id, e.g. `codex_tile`. */
export function tileFeedbackId(provider: ProviderId): string {
  return `${provider}_tile`
}

/** All animated feedback ids (pets + tiles) — ticked by the animation timer. */
export const PET_FEEDBACK_IDS = [
  ...PROVIDER_IDS.map(petFeedbackId),
  ...PROVIDER_IDS.map(tileFeedbackId),
]

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

const providerChoices = PROVIDER_IDS.map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))

const statusChoices: Array<{ id: ProviderStatus; label: string }> = [
  { id: 'offline', label: 'Offline' },
  { id: 'idle', label: 'Idle' },
  { id: 'working', label: 'Working' },
  { id: 'approval', label: 'Approval' },
  { id: 'input', label: 'Input' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'error', label: 'Error' },
]

const actionChoices = [
  { id: 'once', label: 'Approve Once' },
  { id: 'session', label: 'Approve Session' },
  { id: 'reject', label: 'Reject' },
]

export function buildFeedbacks(self: AgentDeckInstance): CompanionFeedbackDefinitions {
  const defs: CompanionFeedbackDefinitions = {
    [FEEDBACK_IDS.providerStatus]: {
      type: 'boolean',
      name: 'Provider status is…',
      description: 'True when the given provider is in the selected status.',
      defaultStyle: { bgcolor: combineRgb(0, 90, 130), color: WHITE },
      options: [
        { type: 'dropdown', id: 'provider', label: 'Provider', default: 'codex', choices: providerChoices },
        { type: 'dropdown', id: 'status', label: 'Status', default: 'working', choices: statusChoices },
      ],
      callback: (feedback) => {
        if (!self.isDaemonConnected()) {
          return (feedback.options.status as string) === 'offline'
        }
        const provider = feedback.options.provider as ProviderId
        const wanted = feedback.options.status as ProviderStatus
        return self.registry.getProvider(provider).status === wanted
      },
    },

    [FEEDBACK_IDS.providerHasApproval]: {
      type: 'boolean',
      name: 'Provider has a pending approval',
      description: 'True when the given provider has at least one pending approval.',
      defaultStyle: { bgcolor: combineRgb(180, 110, 0), color: BLACK },
      options: [
        { type: 'dropdown', id: 'provider', label: 'Provider', default: 'claude', choices: providerChoices },
      ],
      callback: (feedback) => {
        if (!self.isDaemonConnected()) return false
        const provider = feedback.options.provider as ProviderId
        return self.coordinator.approvalCountForProvider(provider) > 0
      },
    },

    [FEEDBACK_IDS.activeApprovalProvider]: {
      type: 'boolean',
      name: 'Active approval is this provider',
      description: 'True when the global active approval currently targets this provider.',
      defaultStyle: { bgcolor: combineRgb(200, 30, 30), color: WHITE },
      options: [
        { type: 'dropdown', id: 'provider', label: 'Provider', default: 'claude', choices: providerChoices },
      ],
      callback: (feedback) => {
        if (!self.isDaemonConnected()) return false
        const provider = feedback.options.provider as ProviderId
        return self.coordinator.getActive()?.provider === provider
      },
    },

    [FEEDBACK_IDS.approvalActionAvailable]: {
      type: 'boolean',
      name: 'Approval action is available',
      description: 'True when the selected decision can act on the active approval (capability-gated).',
      defaultStyle: { bgcolor: combineRgb(0, 120, 40), color: WHITE },
      options: [
        { type: 'dropdown', id: 'action', label: 'Action', default: 'once', choices: actionChoices },
      ],
      callback: (feedback) => {
        if (!self.isDaemonConnected()) return false
        const caps = self.coordinator.getCapabilities()
        switch (feedback.options.action as string) {
          case 'once':
            return caps.approveOnce
          case 'session':
            return caps.approveSession
          case 'reject':
            return caps.reject
          default:
            return false
        }
      },
    },

    [FEEDBACK_IDS.approvalCanNavigate]: {
      type: 'boolean',
      name: 'Approval option list is navigable',
      description:
        'True when the active approval has a live, multi-option list a rotary control can move ' +
        'through (ports AgentDeck\'s Stream Deck+ dial: rotate to highlight, press to select).',
      defaultStyle: { bgcolor: combineRgb(80, 40, 160), color: WHITE },
      options: [],
      callback: () => {
        if (!self.isDaemonConnected()) return false
        return self.coordinator.canNavigate()
      },
    },

    [FEEDBACK_IDS.providerApprovalBlink]: {
      type: 'boolean',
      name: 'Provider needs your response (blink)',
      description:
        'True/false alternates every ~450ms while the given provider has ANY interrupt waiting on you — ' +
        'a gated tool-permission request, a live question/option prompt (e.g. AskUserQuestion), or a diff ' +
        'awaiting review — not just the gated-permission queue. Combine with a solid-color feedback on the ' +
        'same button: this one paints on the "on" beat, the solid color shows through on the "off" beat.',
      defaultStyle: { bgcolor: combineRgb(255, 60, 60), color: WHITE },
      options: [
        { type: 'dropdown', id: 'provider', label: 'Provider', default: 'claude', choices: providerChoices },
      ],
      callback: (feedback) => {
        if (!self.isDaemonConnected()) return false
        const provider = feedback.options.provider as ProviderId
        const status = self.registry.getProvider(provider).status
        if (!needsYourResponse(status)) return false
        return isBlinkOnBeat(self.getPetFrame())
      },
    },
  }

  // Animated per-provider "pet" creatures as the button image. Each reacts to
  // its provider's aggregated status; the frame is ticked by the module.
  const PET_NAME: Record<ProviderId, string> = {
    codex: 'Codex Pet (cloud, animated)',
    claude: 'Claude Pet (octopus, animated)',
    gemini: 'Gemini Pet (spark placeholder, animated)',
    openclaw: 'OpenClaw Pet (crayfish, animated)',
    opencode: 'OpenCode Pet (nested ring, animated)',
    antigravity: 'Antigravity Pet (rainbow mark, animated)',
    kiro: 'Kiro Pet (ghost placeholder, animated)',
  }
  for (const p of PROVIDER_IDS) {
    // Codex offers a skin option: the built-in cloud, or the user's custom Codex
    // avatar "白咪 (baimi)" sliced from ~/.codex/pets/baimi.
    const skinOption =
      p === 'codex'
        ? [
            {
              type: 'dropdown' as const,
              id: 'skin',
              label: 'Skin',
              default: 'default',
              choices: [
                { id: 'default', label: 'Default (cloud)' },
                { id: 'baimi', label: `${BAIMI_NAME} (custom Codex avatar)` },
              ],
            },
          ]
        : []
    defs[petFeedbackId(p)] = {
      type: 'advanced',
      name: PET_NAME[p],
      description: `Draws the ${PROVIDER_LABEL[p]} creature on the button, animated by ${PROVIDER_LABEL[p]} status.`,
      options: skinOption,
      affectedProperties: ['png64'],
      callback: (feedback) => {
        const status = self.isDaemonConnected() ? self.registry.getProvider(p).status : 'offline'
        const frame = self.getPetFrame()
        if (p === 'codex' && feedback.options.skin === 'baimi') {
          return { png64: renderBaimi(status, frame) }
        }
        return { png64: renderPet(p, status, frame) }
      },
    }

    // Rich session tile (official AgentDeck look): status + name + creature +
    // model + ACT badge, all in one key image. Codex's tile also honours the
    // skin option so the official layout can show the custom Codex avatar.
    defs[tileFeedbackId(p)] = {
      type: 'advanced',
      name: `${PROVIDER_LABEL[p]} Tile (official look)`,
      description: `Full ${PROVIDER_LABEL[p]} session tile: status, model, creature and ACT badge.`,
      options: skinOption,
      affectedProperties: ['png64'],
      callback: (feedback) => {
        const connected = self.isDaemonConnected()
        const state = self.registry.getProvider(p)
        const status = connected ? state.status : 'offline'
        const active = connected
          ? state.sessions.find((s) => s.id === state.activeSessionId)
          : undefined
        return {
          png64: renderTile(
            p,
            {
              skin: p === 'codex' ? (feedback.options.skin as string | undefined) : undefined,
              status,
              name: TITLE_NAME[p],
              model: active?.modelName ?? '',
              act: connected && state.sessionCount > 0,
            },
            self.getPetFrame(),
          ),
        }
      },
    }
  }

  // Usage gauge — official Stream Deck+ look. ONE feedback with a "Metric"
  // dropdown, so which window a button shows is a per-button option you can
  // freely change after dragging the preset on, rather than five separate
  // fixed feedbacks each locked to one window. `known` is false until the
  // first usage_update arrives (or after a disconnect), so the button renders
  // a dim "—" rather than a possibly-stale number.
  defs[FEEDBACK_IDS.usageGauge] = {
    type: 'advanced',
    name: 'Usage Gauge (choose metric)',
    description:
      'Full-bleed level-fill usage gauge matching the official Stream Deck+ dial. Pick which window this ' +
      'button shows via the Metric option: Claude 5H/7D windows, Claude\'s binding scoped per-model cap ' +
      '(e.g. a weekly "Fable" limit — the official standalone "Claude Limit" key), or Codex\'s 5H/7D-style ' +
      'rate-limit windows.',
    options: [
      {
        type: 'dropdown',
        id: 'metric',
        label: 'Metric',
        default: 'claude_5h',
        choices: USAGE_METRICS.map((m) => ({ id: m.id, label: m.label })),
      },
    ],
    affectedProperties: ['png64'],
    callback: (feedback) => {
      const metric = feedback.options.metric as UsageMetricId
      const u = self.getUsage()
      switch (metric) {
        case 'claude_5h':
          return {
            png64: renderUsageGauge(
              { provider: 'claude', label: '5H', known: u?.fiveHourPercent !== undefined, usedPercent: u?.fiveHourPercent, resetsAt: u?.fiveHourResetsAt, stale: u?.usageStale },
              self.getPetFrame(),
            ),
          }
        case 'claude_7d':
          return {
            png64: renderUsageGauge(
              { provider: 'claude', label: '7D', known: u?.sevenDayPercent !== undefined, usedPercent: u?.sevenDayPercent, resetsAt: u?.sevenDayResetsAt, stale: u?.usageStale },
              self.getPetFrame(),
            ),
          }
        case 'claude_scoped': {
          const scoped = u?.scopedLimits?.[0]
          return {
            png64: renderUsageGauge(
              {
                provider: 'claude',
                label: (scoped?.label ?? 'SCOPED').toUpperCase(),
                known: scoped !== undefined,
                usedPercent: scoped?.percent,
                resetsAt: scoped?.resetsAt,
                stale: u?.usageStale,
                inactive: scoped?.active === false,
              },
              self.getPetFrame(),
            ),
          }
        }
        case 'codex_5h': {
          const w = u?.codexRateLimits?.primary
          return {
            png64: renderUsageGauge(
              { provider: 'codex', label: '5H', known: w !== undefined, usedPercent: w?.usedPercent, resetsAt: w?.resetsAt, stale: w?.stale },
              self.getPetFrame(),
            ),
          }
        }
        case 'codex_7d': {
          const w = u?.codexRateLimits?.secondary
          return {
            png64: renderUsageGauge(
              { provider: 'codex', label: '7D', known: w !== undefined, usedPercent: w?.usedPercent, resetsAt: w?.resetsAt, stale: w?.stale },
              self.getPetFrame(),
            ),
          }
        }
        default:
          return { png64: renderUsageGauge({ provider: 'claude', label: '?', known: false }, self.getPetFrame()) }
      }
    },
  }

  return defs
}
