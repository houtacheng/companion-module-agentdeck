/**
 * Vendored subset of the AgentDeck daemon wire protocol.
 *
 * Source of truth: puritysb/AgentDeck `shared/src/protocol.ts`, `shared/src/states.ts`,
 * `shared/src/adapter.ts`. Only the shapes this Companion module consumes/produces are
 * copied here — kept deliberately small and annotated with the upstream origin so drift
 * is easy to track. DO NOT extend this into a full mirror; add only what the module uses.
 */

// ---- states.ts: wire values are lowercase strings ----
// enum State { DISCONNECTED='disconnected', IDLE='idle', PROCESSING='processing',
//   AWAITING_PERMISSION='awaiting_permission', AWAITING_OPTION='awaiting_option',
//   AWAITING_DIFF='awaiting_diff' }
export type AgentDeckState =
  | 'disconnected'
  | 'idle'
  | 'processing'
  | 'awaiting_permission'
  | 'awaiting_option'
  | 'awaiting_diff'

// ---- adapter.ts: AgentType union ----
export type AgentType =
  | 'claude-code'
  | 'openclaw'
  | 'codex-cli'
  | 'codex-app'
  | 'opencode'
  | 'antigravity'
  | 'kiro-cli'
  | 'kiro-ide'
  | 'monitor'

export type PromptType = 'yes_no' | 'yes_no_always' | 'multi_select' | 'diff_review'

// ---- protocol.ts: PromptOption ----
export interface PromptOption {
  index: number
  label: string
  shortcut?: string
  recommended?: boolean
  selected?: boolean
  kind?: 'choice' | 'freeform_input'
}

// ---- protocol.ts: SessionInfo (the multi-session roster row) ----
export interface SessionInfo {
  id: string
  port: number
  pid?: number
  projectName: string
  agentType?: AgentType
  alive: boolean
  /** Current lowercase state string (see AgentDeckState). Typed loose upstream. */
  state?: string
  modelName?: string
  effortLevel?: string
  startedAt?: string
  weight?: number
  currentTool?: string
  controlMode?: 'managed' | 'observed'
  cwd?: string
  currentTask?: string
  activity?: string
  goal?: string
  contextPercent?: number
  totalTokens?: number
  question?: string
  /** Present when an observed PreToolUse permission gate is held open for device
   *  approval — answer with permission_decision { requestId, decision }. */
  requestId?: string
  stopRequested?: boolean
  /** True when a device press on this session's options WILL reach the agent
   *  (terminal injection or held ask-gate). Emitted in both polarities upstream. */
  liveAnswerable?: boolean
  askGroupIndex?: number
  askGroupCount?: number
  promptType?: PromptType
  options?: PromptOption[]
  elapsedSec?: number
  /** On-demand review lifecycle for the REVIEW badge tile ('running' while the judge works). */
  reviewStatus?: 'running' | 'done' | 'error'
  /** Last review verdict (with reviewFindings) — devices render "risk: low · 2". */
  reviewRisk?: 'low' | 'medium' | 'high'
  reviewFindings?: number
}

// ---- protocol.ts: ScopedUsageLimit (per-model scoped cap, e.g. a weekly Fable cap) ----
export interface ScopedUsageLimit {
  kind?: string
  /** Human label — the scoped model display name (e.g. "Fable"), else the kind. */
  label: string
  /** Percent of this limit already CONSUMED (0–100). */
  percent: number
  severity?: string
  resetsAt?: string
  /** True when this limit is the currently active/binding constraint. */
  active?: boolean
}

// ---- protocol.ts: Codex rate-limit windows (parsed from local rollout files) ----
export interface CodexRateLimitWindow {
  usedPercent: number
  /** Rolling window length in minutes (primary ≈ 300 = 5h, secondary ≈ 10080 = 7d). */
  windowMinutes: number
  resetsAt?: string
  /** True when this window's snapshot has expired — render dim/"stale", not a countdown. */
  stale?: boolean
}

export interface CodexCredits {
  hasCredits: boolean
  unlimited: boolean
  balance?: string
}

export interface CodexRateLimits {
  primary?: CodexRateLimitWindow
  secondary?: CodexRateLimitWindow
  planType?: string
  limitId?: string
  credits?: CodexCredits
  /** ISO-8601 instant this snapshot was WRITTEN by Codex — used to tell "94% now"
   *  from "94% four hours ago" since Codex usage is a passive rollout-file read. */
  capturedAt?: string
}

// ---- protocol.ts: usage_update (Claude 5h/7d/scoped + Codex rate limits) ----
export interface UsageEvent {
  type: 'usage_update'
  fiveHourPercent?: number
  fiveHourResetsAt?: string
  sevenDayPercent?: number
  sevenDayResetsAt?: string
  /** Sorted worst-first (active desc, then percent desc) — index 0 is the
   *  binding scoped cap to headline, matching upstream's own "triple" dial view. */
  scopedLimits?: ScopedUsageLimit[]
  /** True when displaying cached data after a fetch failure. */
  usageStale?: boolean
  codexRateLimits?: CodexRateLimits
}

// ---- protocol.ts: events we consume ----
export interface SessionsListEvent {
  type: 'sessions_list'
  sessions: SessionInfo[]
}

export interface ConnectionEvent {
  type: 'connection'
  status: 'connected' | 'reconnecting' | 'disconnected'
  sessionId?: string
}

/** Loose envelope — every daemon → client message has a string `type`. */
export interface BridgeEnvelope {
  type: string
  [key: string]: unknown
}

// ---- protocol.ts: commands we produce (Plugin → Bridge) ----
export interface PermissionDecisionCommand {
  type: 'permission_decision'
  requestId: string
  decision: 'allow' | 'deny'
}

export interface SelectOptionCommand {
  type: 'select_option'
  index: number
  sessionId?: string
  /** Echo of the question the device displayed — daemon drops a stale press. */
  question?: string
}

export interface SessionCommand {
  type: 'session_command'
  sessionId: string
  command: { type: string; [key: string]: unknown }
}

/** Injects text as if typed at the session's prompt — used for the official
 *  GO ON / COMMIT / CLEAR / MODEL quick-action keys ('go on', '/commit',
 *  '/clear', '/model'). Sent bare for openclaw / unmanaged sessions, wrapped
 *  in SessionCommand otherwise — see sendSessionCommand() in main.ts. */
export interface SendPromptCommand {
  type: 'send_prompt'
  text: string
}

/** Ctrl+C — the official STOP key. */
export interface InterruptCommand {
  type: 'interrupt'
}

/** Esc — the official ESC key (cancel prompt/selection). */
export interface EscapeCommand {
  type: 'escape'
}

export interface ClientRegisterCommand {
  type: 'client_register'
  clientType: string
  clientLabel?: string
  devices?: Array<{ id: string; name: string; family?: string; columns?: number; rows?: number }>
}

/** Requests a fresh `usage_update` push — the same command the official
 *  Stream Deck+ dial sends on connect and on press. */
export interface QueryUsageCommand {
  type: 'query_usage'
}

/** Independent on-demand review of a session's latest work (the official
 *  REVIEW deck button) — daemon-side judge model, sent top-level (not wrapped
 *  in session_command). */
export interface ReviewRunCommand {
  type: 'review_run'
  sessionId: string
}

export type OutgoingCommand =
  | PermissionDecisionCommand
  | SelectOptionCommand
  | SessionCommand
  | ClientRegisterCommand
  | QueryUsageCommand
  | ReviewRunCommand
  | SendPromptCommand
  | InterruptCommand
  | EscapeCommand

// ---- protocol.ts constants ----
export const BRIDGE_WS_PORT = 9120
