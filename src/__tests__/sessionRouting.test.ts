import { describe, it, expect } from 'vitest'
import type { SessionInfo } from '../agentdeck/protocol.js'
import { shouldWrapInSessionCommand, buildQuickActionCommand } from '../companion/sessionRouting.js'

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return { id: 's1', port: 0, projectName: 'p', alive: true, ...overrides }
}

describe('shouldWrapInSessionCommand (mirrors upstream sendFocusedSessionCommand)', () => {
  it('wraps a managed session (port > 0)', () => {
    expect(shouldWrapInSessionCommand(session({ port: 4123 }))).toBe(true)
  })
  it('wraps an observed session (controlMode observed) even with no port', () => {
    expect(shouldWrapInSessionCommand(session({ port: 0, controlMode: 'observed' }))).toBe(true)
  })
  it('does not wrap a bare/unmanaged session (no port, not observed)', () => {
    expect(shouldWrapInSessionCommand(session({ port: 0 }))).toBe(false)
  })
  it('never wraps openclaw, even if it reports a port', () => {
    expect(shouldWrapInSessionCommand(session({ port: 4123, agentType: 'openclaw' }))).toBe(false)
  })
})

describe('buildQuickActionCommand', () => {
  it('go_on injects "go on"', () => {
    expect(buildQuickActionCommand('go_on')).toEqual({ type: 'send_prompt', text: 'go on' })
  })
  it('commit injects "/commit"', () => {
    expect(buildQuickActionCommand('commit')).toEqual({ type: 'send_prompt', text: '/commit' })
  })
  it('clear injects "/clear"', () => {
    expect(buildQuickActionCommand('clear')).toEqual({ type: 'send_prompt', text: '/clear' })
  })
  it('model injects "/model"', () => {
    expect(buildQuickActionCommand('model')).toEqual({ type: 'send_prompt', text: '/model' })
  })
  it('stop sends interrupt (Ctrl+C)', () => {
    expect(buildQuickActionCommand('stop')).toEqual({ type: 'interrupt' })
  })
  it('esc sends escape', () => {
    expect(buildQuickActionCommand('esc')).toEqual({ type: 'escape' })
  })
})
