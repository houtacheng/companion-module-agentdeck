import { describe, it, expect } from 'vitest'
import { renderPet } from '../companion/pet.js'
import { PROVIDER_IDS } from '../agentdeck/mapper.js'
import type { ProviderStatus } from '../state/stateMapper.js'

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const statuses: ProviderStatus[] = ['offline','idle','working','approval','input','review','done','error']

describe('renderPet', () => {
  it('returns a valid base64 PNG for every provider + status', () => {
    for (const p of PROVIDER_IDS) for (const s of statuses) {
      const buf = Buffer.from(renderPet(p, s, 7), 'base64')
      expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
      expect(buf.length).toBeGreaterThan(50)
    }
  })
  it('animates for animated statuses', () => {
    for (const p of PROVIDER_IDS) {
      expect(renderPet(p, 'working', 0)).not.toBe(renderPet(p, 'working', 4))
    }
  })
  it('offline is static across frames', () => {
    for (const p of PROVIDER_IDS) {
      expect(renderPet(p, 'offline', 0)).toBe(renderPet(p, 'offline', 9))
    }
  })
})
