import type { SessionInfo } from '../agentdeck/protocol.js'

export type SessionQuickActionKind = 'go_on' | 'commit' | 'clear' | 'model' | 'review' | 'stop' | 'esc'

/** Mirrors upstream `sendFocusedSessionCommand`'s routing decision: wrap in
 *  `session_command` for anything the daemon can steer directly (managed
 *  bridges get PTY delivery, observed sessions get hook-steering); openclaw
 *  and bare/unmanaged sessions get the command sent top-level. */
export function shouldWrapInSessionCommand(session: SessionInfo): boolean {
  return session.agentType !== 'openclaw' && (session.port > 0 || session.controlMode === 'observed')
}

/** Build the inner command for a session quick-action kind. `review` is
 *  handled separately by the caller (it is always a top-level `review_run`,
 *  never wrapped). */
export function buildQuickActionCommand(
  kind: Exclude<SessionQuickActionKind, 'review'>,
): { type: string; [k: string]: unknown } {
  switch (kind) {
    case 'go_on':
      return { type: 'send_prompt', text: 'go on' }
    case 'commit':
      return { type: 'send_prompt', text: '/commit' }
    case 'clear':
      return { type: 'send_prompt', text: '/clear' }
    case 'model':
      return { type: 'send_prompt', text: '/model' }
    case 'stop':
      return { type: 'interrupt' }
    case 'esc':
      return { type: 'escape' }
  }
}
