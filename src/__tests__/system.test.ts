import { describe, it, expect } from 'vitest'
import { LAUNCH_TARGETS, runLaunchTarget } from '../companion/system.js'

describe('LAUNCH_TARGETS (verbatim from upstream launch-targets.ts)', () => {
  it('matches the official E4 Launcher fallback chains', () => {
    expect(LAUNCH_TARGETS).toEqual({
      claude: 'app:Claude|url:https://claude.ai',
      codex: 'app:Codex|url:https://chatgpt.com/codex/cloud',
      openclaw: 'url:http://127.0.0.1:18789',
    })
  })
})

describe('runLaunchTarget', () => {
  it('rejects an empty target', async () => {
    await expect(runLaunchTarget('')).rejects.toThrow('Empty launch target')
  })
  it('rejects an unrecognized step', async () => {
    await expect(runLaunchTarget('bogus:foo')).rejects.toThrow('Unrecognized launch target')
  })
})
