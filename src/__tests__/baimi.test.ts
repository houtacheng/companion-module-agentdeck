import { describe, it, expect } from 'vitest'
import { renderBaimi } from '../companion/baimi.js'
import type { ProviderStatus } from '../state/stateMapper.js'

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const statuses: ProviderStatus[] = ['offline','idle','working','approval','input','review','done','error']

describe('renderBaimi (custom Codex avatar)', () => {
  it('returns a valid 72x72-ish PNG for every status', () => {
    for (const s of statuses) {
      const buf = Buffer.from(renderBaimi(s, 5), 'base64')
      expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
      expect(buf.length).toBeGreaterThan(200)
    }
  })
  it('animates working across frames', () => {
    expect(renderBaimi('working', 0)).not.toBe(renderBaimi('working', 5))
  })
})
