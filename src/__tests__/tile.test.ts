import { describe, it, expect } from 'vitest'
import { renderTile } from '../companion/tile.js'
import { PROVIDER_IDS } from '../agentdeck/mapper.js'
import type { ProviderStatus } from '../state/stateMapper.js'

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const statuses: ProviderStatus[] = ['offline','idle','working','approval','input','review','done','error']

describe('renderTile', () => {
  it('valid PNG for every provider + status, with/without model+act', () => {
    for (const p of PROVIDER_IDS) for (const s of statuses) {
      for (const extra of [{model:'opus-4',act:true}, {model:'',act:false}]) {
        const buf = Buffer.from(renderTile(p, { status: s, name: p, ...extra }, 3), 'base64')
        expect(buf.subarray(0,8).equals(PNG_SIG)).toBe(true)
        expect(buf.length).toBeGreaterThan(200)
      }
    }
  })
  it('long status/model do not throw (auto-fit)', () => {
    expect(() => renderTile('codex', { status:'working', name:'Codex', model:'gpt-5-codex-preview-long', act:true }, 0)).not.toThrow()
  })
})

describe('renderTile — Codex baimi skin', () => {
  it('renders a valid PNG with the baimi skin and differs from the default cloud', () => {
    const withBaimi = renderTile('codex', { status: 'idle', name: 'Codex', skin: 'baimi' }, 2)
    const withDefault = renderTile('codex', { status: 'idle', name: 'Codex' }, 2)
    const buf = Buffer.from(withBaimi, 'base64')
    expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
    expect(withBaimi).not.toBe(withDefault)
  })
  it('baimi skin is ignored for non-codex providers', () => {
    // claude has no baimi asset — must fall back to its own creature, not throw.
    expect(() => renderTile('claude', { status: 'idle', name: 'Claude', skin: 'baimi' }, 2)).not.toThrow()
  })
})
