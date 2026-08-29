import { describe, it, expect } from 'vitest'
import type { SessionInfo } from '../agentdeck/protocol.js'
import { mapAgentType } from '../agentdeck/mapper.js'
import { mapSessionStatus } from '../state/stateMapper.js'
import { SessionStore } from '../state/sessionStore.js'
import { ProviderRegistry } from '../state/providerRegistry.js'
import { ApprovalCoordinator } from '../approval/approvalCoordinator.js'

function session(partial: Partial<SessionInfo> & Pick<SessionInfo, 'id'>): SessionInfo {
  return {
    port: 9120,
    projectName: partial.projectName ?? 'proj',
    alive: partial.alive ?? true,
    ...partial,
  } as SessionInfo
}

function makeStack() {
  const store = new SessionStore()
  const registry = new ProviderRegistry(store)
  const coordinator = new ApprovalCoordinator(store)
  return { store, registry, coordinator }
}

describe('mapAgentType', () => {
  it('maps codex-cli/app → codex, claude-code → claude', () => {
    expect(mapAgentType('codex-cli')).toBe('codex')
    expect(mapAgentType('codex-app')).toBe('codex')
    expect(mapAgentType('claude-code')).toBe('claude')
  })
  it('has no Gemini mapping — upstream has no adapter for it', () => {
    expect(mapAgentType('gemini')).toBeUndefined()
    expect(mapAgentType('gemini-cli')).toBeUndefined()
  })
  it('maps every other AgentDeck-supported agent to its own provider', () => {
    expect(mapAgentType('openclaw')).toBe('openclaw')
    expect(mapAgentType('opencode')).toBe('opencode')
    expect(mapAgentType('antigravity')).toBe('antigravity')
    expect(mapAgentType('kiro-cli')).toBe('kiro')
    expect(mapAgentType('kiro-ide')).toBe('kiro')
  })
  it('drops non-surface agent types', () => {
    expect(mapAgentType('monitor')).toBeUndefined()
    expect(mapAgentType(undefined)).toBeUndefined()
  })
})

describe('stateMapper', () => {
  it('maps wire states per spec', () => {
    expect(mapSessionStatus({ state: 'processing', alive: true })).toBe('working')
    expect(mapSessionStatus({ state: 'awaiting_permission', alive: true })).toBe('approval')
    expect(mapSessionStatus({ state: 'awaiting_diff', alive: true })).toBe('review')
    expect(mapSessionStatus({ state: 'awaiting_option', alive: true })).toBe('input')
    expect(mapSessionStatus({ state: 'idle', alive: true })).toBe('idle')
    expect(mapSessionStatus({ state: 'disconnected', alive: true })).toBe('offline')
  })
  it('fails safe to offline for dead/unknown', () => {
    expect(mapSessionStatus({ state: 'processing', alive: false })).toBe('offline')
    expect(mapSessionStatus({ state: 'weird', alive: true })).toBe('offline')
    expect(mapSessionStatus({ state: undefined, alive: true })).toBe('offline')
  })
})

describe('provider aggregation (priority)', () => {
  it('aggregates several codex sessions to the highest-priority status', () => {
    const { store, registry } = makeStack()
    store.replaceAll([
      session({ id: 'a', agentType: 'codex-cli', state: 'processing' }),
      session({ id: 'b', agentType: 'codex-cli', state: 'awaiting_permission' }),
      session({ id: 'c', agentType: 'codex-cli', state: 'idle' }),
    ])
    const codex = registry.getProvider('codex')
    expect(codex.status).toBe('approval')
    expect(codex.sessionCount).toBe(3)
    expect(codex.workingCount).toBe(1)
    expect(codex.approvalCount).toBe(1)
  })
})

describe('provider session ordering (multi-session addressing — reported bug: ' +
  'every Tile/Pet preset for a provider showed the same session)', () => {
  it('sorts sessions by startedAt so slot indices are stable', () => {
    const { store, registry } = makeStack()
    store.replaceAll([
      session({ id: 'later', agentType: 'claude-code', state: 'idle', startedAt: '2026-08-21T08:00:00Z' }),
      session({ id: 'earlier', agentType: 'claude-code', state: 'processing', startedAt: '2026-08-21T07:00:00Z' }),
    ])
    const claude = registry.getProvider('claude')
    expect(claude.sessions.map((s) => s.id)).toEqual(['earlier', 'later'])
  })
  it('falls back to id ordering when startedAt is missing/tied', () => {
    const { store, registry } = makeStack()
    store.replaceAll([
      session({ id: 'zzz', agentType: 'claude-code', state: 'idle' }),
      session({ id: 'aaa', agentType: 'claude-code', state: 'idle' }),
    ])
    const claude = registry.getProvider('claude')
    expect(claude.sessions.map((s) => s.id)).toEqual(['aaa', 'zzz'])
  })
  it('slot order is stable across rebuilds even if sessions_list arrives reshuffled', () => {
    const { store, registry } = makeStack()
    const a = session({ id: 'a', agentType: 'claude-code', state: 'idle', startedAt: '2026-08-21T07:00:00Z' })
    const b = session({ id: 'b', agentType: 'claude-code', state: 'idle', startedAt: '2026-08-21T08:00:00Z' })
    store.replaceAll([a, b])
    const first = registry.getProvider('claude').sessions.map((s) => s.id)
    store.replaceAll([b, a]) // daemon resent the roster in a different order
    const second = registry.getProvider('claude').sessions.map((s) => s.id)
    expect(first).toEqual(second)
    expect(first).toEqual(['a', 'b'])
  })
  it('two concurrent sessions of the same provider are independently addressable by slot index', () => {
    const { store, registry } = makeStack()
    store.replaceAll([
      session({ id: 'idle-one', agentType: 'claude-code', state: 'idle', startedAt: '2026-08-21T07:00:00Z' }),
      session({ id: 'working-two', agentType: 'claude-code', state: 'processing', startedAt: '2026-08-21T08:00:00Z' }),
    ])
    const claude = registry.getProvider('claude')
    // The old bug: every Tile button showed claude.activeSessionId (the
    // priority-picked session — here 'working-two', since working > idle),
    // no matter how many were dragged onto the page. Slot 0/1 must resolve
    // to the two DIFFERENT sessions instead.
    expect(claude.activeSessionId).toBe('working-two')
    expect(claude.sessions[0]?.id).toBe('idle-one')
    expect(claude.sessions[1]?.id).toBe('working-two')
  })
})

describe('Scenario A — Codex working, Claude idle', () => {
  it('produces the expected surface + empty queue', () => {
    const { store, registry, coordinator } = makeStack()
    store.replaceAll([
      session({ id: 'a', agentType: 'codex-cli', state: 'processing' }),
      session({ id: 'b', agentType: 'claude-code', state: 'idle' }),
    ])
    coordinator.update()
    expect(registry.getProvider('codex').status).toBe('working')
    expect(registry.getProvider('claude').status).toBe('idle')
    expect(coordinator.getQueue()).toHaveLength(0)
    expect(coordinator.getActive()).toBeNull()
  })
})

describe('Scenario B — Claude actionable approval while Codex works', () => {
  it('sets active approval to claude', () => {
    const { store, registry, coordinator } = makeStack()
    store.replaceAll([
      session({ id: 'a', agentType: 'codex-cli', state: 'processing' }),
      session({ id: 'b', agentType: 'claude-code', state: 'awaiting_permission', requestId: 'abc' }),
    ])
    coordinator.update()
    expect(registry.getProvider('codex').status).toBe('working')
    expect(registry.getProvider('claude').status).toBe('approval')
    const active = coordinator.getActive()
    expect(active?.provider).toBe('claude')
    expect(active?.actionable).toBe(true)
    // requestId gate → allow/deny only, no session.
    const caps = coordinator.getCapabilities()
    expect(caps).toEqual({ approveOnce: true, approveSession: false, reject: true })
    expect(coordinator.buildDecision('once')).toEqual({
      type: 'permission_decision',
      requestId: 'abc',
      decision: 'allow',
    })
    expect(coordinator.buildDecision('reject')).toEqual({
      type: 'permission_decision',
      requestId: 'abc',
      decision: 'deny',
    })
    expect(coordinator.buildDecision('session')).toBeNull()
  })
})

describe('Scenario C — auto advance after resolve', () => {
  it('advances Claude → Codex when Claude clears', () => {
    const { store, coordinator } = makeStack()
    const t0 = 1000
    store.replaceAll([
      session({ id: 'claude1', agentType: 'claude-code', state: 'awaiting_permission', requestId: 'c1' }),
      session({ id: 'codex1', agentType: 'codex-cli', state: 'awaiting_permission', requestId: 'x1' }),
    ])
    coordinator.update(t0)
    expect(coordinator.getActive()?.provider).toBe('claude')
    // Claude resolved → removed from roster.
    store.replaceAll([
      session({ id: 'codex1', agentType: 'codex-cli', state: 'awaiting_permission', requestId: 'x1' }),
    ])
    coordinator.update(t0 + 500)
    expect(coordinator.getActive()?.provider).toBe('codex')
  })
})

describe('Scenario D — observed-only approval is not actionable', () => {
  it('shows approval but disables all buttons', () => {
    const { store, registry, coordinator } = makeStack()
    store.replaceAll([
      session({
        id: 'b',
        agentType: 'claude-code',
        state: 'awaiting_permission',
        controlMode: 'observed',
        liveAnswerable: false,
        // no requestId, no options
      }),
    ])
    coordinator.update()
    expect(registry.getProvider('claude').status).toBe('approval')
    const active = coordinator.getActive()
    expect(active?.actionable).toBe(false)
    expect(coordinator.getCapabilities()).toEqual({
      approveOnce: false,
      approveSession: false,
      reject: false,
    })
    expect(coordinator.buildDecision('once')).toBeNull()
    expect(coordinator.buildDecision('reject')).toBeNull()
  })
})

describe('Scenario E — manual provider selection', () => {
  it('switches active to Codex when the user presses CODEX', () => {
    const { store, coordinator } = makeStack()
    const t0 = 2000
    store.replaceAll([
      session({ id: 'claude1', agentType: 'claude-code', state: 'awaiting_permission', requestId: 'c1' }),
      session({ id: 'codex1', agentType: 'codex-cli', state: 'awaiting_permission', requestId: 'x1' }),
    ])
    coordinator.update(t0)
    expect(coordinator.getActive()?.provider).toBe('claude')
    expect(coordinator.selectProvider('codex')).toBe(true)
    expect(coordinator.getActive()?.provider).toBe('codex')
    // Selecting a provider with no pending approval leaves active unchanged.
    expect(coordinator.selectProvider('kiro')).toBe(false)
    expect(coordinator.getActive()?.provider).toBe('codex')
  })
})

describe('Scenario F — disconnect invalidation', () => {
  it('drops queue on reset and rebuilds only from fresh roster', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({ id: 'claude1', agentType: 'claude-code', state: 'awaiting_permission', requestId: 'c1' }),
    ])
    coordinator.update()
    expect(coordinator.getActive()).not.toBeNull()
    // Simulate disconnect.
    store.clear()
    coordinator.reset()
    expect(coordinator.getQueue()).toHaveLength(0)
    expect(coordinator.getActive()).toBeNull()
  })
})

describe('managed yes_no_always → Approve Session enabled', () => {
  it('enables session via select_option at the always index', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({
        id: 'm1',
        agentType: 'codex-cli',
        state: 'awaiting_permission',
        controlMode: 'managed',
        promptType: 'yes_no_always',
        question: 'Run tool?',
        options: [
          { index: 0, label: 'Yes' },
          { index: 1, label: 'Yes, and always allow this session' },
          { index: 2, label: 'No' },
        ],
      }),
    ])
    coordinator.update()
    const caps = coordinator.getCapabilities()
    expect(caps.approveSession).toBe(true)
    expect(coordinator.buildDecision('once')).toEqual({
      type: 'select_option',
      sessionId: 'm1',
      index: 0,
      question: 'Run tool?',
    })
    expect(coordinator.buildDecision('session')).toEqual({
      type: 'select_option',
      sessionId: 'm1',
      index: 1,
      question: 'Run tool?',
    })
    expect(coordinator.buildDecision('reject')).toEqual({
      type: 'session_command',
      sessionId: 'm1',
      command: { type: 'escape' },
    })
  })
})

describe('ordering — actionable before older non-actionable', () => {
  it('puts an actionable newer approval ahead of an older observed-only one', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({ id: 'old', agentType: 'claude-code', state: 'awaiting_permission', controlMode: 'observed', liveAnswerable: false }),
      session({ id: 'new', agentType: 'codex-cli', state: 'awaiting_permission', requestId: 'r1' }),
    ])
    coordinator.update(1000)
    // Even though 'old' was added first, 'new' is actionable → head of queue.
    expect(coordinator.getActive()?.sessionId).toBe('new')
  })
})

describe('rotary option navigation (ports AgentDeck dial: rotate + press)', () => {
  it('is not navigable for a plain yes/no gate (2 options or fewer)', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({ id: 'a', agentType: 'claude-code', state: 'awaiting_permission', requestId: 'r1' }),
    ])
    coordinator.update()
    expect(coordinator.canNavigate()).toBe(false)
    expect(coordinator.rotateOption('down')).toBe(false)
    expect(coordinator.buildSelectHighlighted()).toBeNull()
  })

  it('rotates the highlight through a managed multi-option list and wraps', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({
        id: 'm1',
        agentType: 'codex-cli',
        state: 'awaiting_permission',
        controlMode: 'managed',
        promptType: 'multi_select',
        question: 'Pick one',
        options: [
          { index: 0, label: 'Alpha' },
          { index: 1, label: 'Beta' },
          { index: 2, label: 'Gamma' },
        ],
      }),
    ])
    coordinator.update()
    expect(coordinator.canNavigate()).toBe(true)
    expect(coordinator.getCursorIndex()).toBe(0)
    expect(coordinator.getHighlightedOption()?.label).toBe('Alpha')

    expect(coordinator.rotateOption('down')).toBe(true)
    expect(coordinator.getCursorIndex()).toBe(1)
    expect(coordinator.getHighlightedOption()?.label).toBe('Beta')

    // wraps forward past the end
    coordinator.rotateOption('down')
    coordinator.rotateOption('down')
    expect(coordinator.getCursorIndex()).toBe(0)

    // wraps backward past the start
    coordinator.rotateOption('up')
    expect(coordinator.getCursorIndex()).toBe(2)
    expect(coordinator.getHighlightedOption()?.label).toBe('Gamma')

    expect(coordinator.buildSelectHighlighted()).toEqual({
      type: 'select_option',
      sessionId: 'm1',
      index: 2,
      question: 'Pick one',
    })
  })

  it('resets the cursor when the active candidate changes', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({
        id: 'm1',
        agentType: 'codex-cli',
        state: 'awaiting_permission',
        controlMode: 'managed',
        promptType: 'multi_select',
        options: [{ index: 0, label: 'A' }, { index: 1, label: 'B' }, { index: 2, label: 'C' }],
      }),
    ])
    coordinator.update(1000)
    coordinator.rotateOption('down')
    coordinator.rotateOption('down')
    expect(coordinator.getCursorIndex()).toBe(2)

    // A new, different active candidate arrives — cursor must not carry over.
    store.replaceAll([
      session({
        id: 'm2',
        agentType: 'claude-code',
        state: 'awaiting_permission',
        controlMode: 'managed',
        promptType: 'multi_select',
        options: [{ index: 0, label: 'X' }, { index: 1, label: 'Y' }],
      }),
    ])
    coordinator.update(2000)
    expect(coordinator.getCursorIndex()).toBe(0)
  })

  it('is fail-closed: not navigable when not actionable', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({
        id: 'obs1',
        agentType: 'claude-code',
        state: 'awaiting_permission',
        controlMode: 'observed',
        liveAnswerable: false,
        promptType: 'multi_select',
        options: [{ index: 0, label: 'A' }, { index: 1, label: 'B' }, { index: 2, label: 'C' }],
      }),
    ])
    coordinator.update()
    expect(coordinator.getActive()?.actionable).toBe(false)
    expect(coordinator.canNavigate()).toBe(false)
    expect(coordinator.rotateOption('down')).toBe(false)
    expect(coordinator.buildSelectHighlighted()).toBeNull()
  })
})

describe('extended providers — OpenClaw / OpenCode / Antigravity / Kiro', () => {
  it('aggregates sessions for every AgentDeck-supported provider, not just the fixed 2x3', () => {
    const { store, registry } = makeStack()
    store.replaceAll([
      session({ id: 'a', agentType: 'openclaw', state: 'processing' }),
      session({ id: 'b', agentType: 'opencode', state: 'idle' }),
      session({ id: 'c', agentType: 'antigravity', state: 'awaiting_permission', requestId: 'r1' }),
      session({ id: 'd', agentType: 'kiro-cli', state: 'idle' }),
      session({ id: 'e', agentType: 'kiro-ide', state: 'processing' }),
    ])
    expect(registry.getProvider('openclaw').status).toBe('working')
    expect(registry.getProvider('opencode').status).toBe('idle')
    expect(registry.getProvider('antigravity').status).toBe('approval')
    // kiro-cli and kiro-ide fold into one 'kiro' provider row.
    const kiro = registry.getProvider('kiro')
    expect(kiro.sessionCount).toBe(2)
    expect(kiro.status).toBe('working') // processing outranks idle
  })

  it('participates in the global approval queue like any other provider', () => {
    const { store, coordinator } = makeStack()
    store.replaceAll([
      session({ id: 'a', agentType: 'antigravity', state: 'awaiting_permission', requestId: 'r1' }),
    ])
    coordinator.update()
    const active = coordinator.getActive()
    expect(active?.provider).toBe('antigravity')
    expect(active?.actionable).toBe(true)
    expect(coordinator.buildDecision('once')).toEqual({
      type: 'permission_decision',
      requestId: 'r1',
      decision: 'allow',
    })
  })
})
