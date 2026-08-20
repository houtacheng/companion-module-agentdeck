import { describe, it, expect } from 'vitest'
import { renderUsageGauge, formatResetTime } from '../companion/usageGauge.js'

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

describe('formatResetTime (verbatim port of upstream formatResetTime)', () => {
  it('returns empty for missing/invalid input', () => {
    expect(formatResetTime(undefined)).toBe('')
    expect(formatResetTime('not-a-date')).toBe('')
  })
  it('returns "now" once the instant has passed', () => {
    expect(formatResetTime(new Date(Date.now() - 1000).toISOString())).toBe('now')
  })
  it('formats sub-hour as "Mm"', () => {
    expect(formatResetTime(new Date(Date.now() + 5 * 60_000).toISOString())).toBe('5m')
  })
  it('formats sub-day as "HhMm" (matches screenshot: 1h32m)', () => {
    const iso = new Date(Date.now() + 92 * 60_000).toISOString() // 1h32m
    expect(formatResetTime(iso)).toBe('1h32m')
  })
  it('formats multi-day as "DdHh" (matches screenshot: 4d11h)', () => {
    const iso = new Date(Date.now() + (4 * 24 + 11) * 3_600_000).toISOString()
    expect(formatResetTime(iso)).toBe('4d11h')
  })
  it('drops the hour suffix on an exact day boundary', () => {
    const iso = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString()
    expect(formatResetTime(iso)).toBe('3d')
  })
})

describe('renderUsageGauge', () => {
  it('renders a valid PNG for the known state (matches screenshot values)', () => {
    const png = renderUsageGauge(
      { provider: 'claude', label: '5H', known: true, usedPercent: 46, resetsAt: new Date(Date.now() + 92 * 60_000).toISOString() },
      0,
    )
    const buf = Buffer.from(png, 'base64')
    expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
  })

  it('renders a valid PNG for the unknown ("—") state', () => {
    const buf = Buffer.from(renderUsageGauge({ provider: 'codex', label: '5H', known: false }, 0), 'base64')
    expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
  })

  it('renders a valid PNG at 0% (matches screenshot: FABLE 0%)', () => {
    const buf = Buffer.from(renderUsageGauge({ provider: 'claude', label: 'FABLE', known: true, usedPercent: 0 }, 0), 'base64')
    expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
  })

  it('renders distinctly across the severity ramp thresholds (green/amber/red)', () => {
    const low = renderUsageGauge({ provider: 'claude', label: '5H', known: true, usedPercent: 20 }, 0)
    const mid = renderUsageGauge({ provider: 'claude', label: '5H', known: true, usedPercent: 65 }, 0)
    const high = renderUsageGauge({ provider: 'claude', label: '5H', known: true, usedPercent: 92 }, 0)
    expect(low).not.toBe(mid)
    expect(mid).not.toBe(high)
    expect(low).not.toBe(high)
  })

  it('is valid for every provider (creature icon must not throw)', () => {
    for (const provider of ['codex', 'claude', 'gemini', 'openclaw', 'opencode', 'antigravity', 'kiro'] as const) {
      const buf = Buffer.from(renderUsageGauge({ provider, label: 'X', known: true, usedPercent: 10 }, 0), 'base64')
      expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true)
    }
  })
})
