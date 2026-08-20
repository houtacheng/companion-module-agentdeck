import { encodePng, drawCreatureInto } from './pet.js'
import { drawText, measureText } from './text.js'
import type { ProviderId } from '../agentdeck/mapper.js'

/**
 * Usage gauge — the official AgentDeck Stream Deck+ look (E2 Claude / E3 Codex
 * dials, and the equivalent 144×144 keypad tile): a full-bleed fill rising
 * from the bottom to the used%, a severity ramp (green/amber/red), the
 * provider's creature in the top-right corner, a big percentage, and a reset
 * countdown. Verified against upstream `plugin/src/renderers/usage-gauge.ts`
 * (`renderUsageGauge`) — thresholds, colours, and the reset-time format
 * (`formatResetTime`) are transcribed, not guessed.
 */

type RGB = [number, number, number]

const TILE = 144
const RADIUS = 12

const BG: RGB = [0x0f, 0x17, 0x2a]
const LABEL_DIM: RGB = [0x64, 0x74, 0x8b]
const TEXT_DIM: RGB = [0x47, 0x55, 0x69]
const HEADLINE: RGB = [0xff, 0xff, 0xff]
const STALE_FILL: RGB = [0x64, 0x74, 0x8b]
const INACTIVE_FILL: RGB = [0x22, 0xd3, 0xee] // UI.cyan — informational, not alarm
const CRITICAL_FILL: RGB = [0xef, 0x44, 0x44]
const WARN_FILL: RGB = [0xea, 0xb3, 0x08]
const OK_FILL: RGB = [0x22, 0xc5, 0x5e]

/** Severity ramp by USED percent: ≤50 green, 50–80 amber, >80 red — verbatim
 *  thresholds from upstream `rampColor`. A stale window drops to muted grey;
 *  an inactive scoped cap drops to informational cyan (never reads as alarm). */
function rampColor(used: number, stale: boolean, inactive: boolean): RGB {
  if (stale) return STALE_FILL
  if (inactive) return INACTIVE_FILL
  if (used > 80) return CRITICAL_FILL
  if (used > 50) return WARN_FILL
  return OK_FILL
}

/** Reset countdown, upstream `formatResetTime` verbatim: "1h32m", "4d11h",
 *  "23m", or "now" once past. Empty string on missing/invalid input. */
export function formatResetTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const t = d.getTime()
  if (Number.isNaN(t)) return ''
  const diff = t - Date.now()
  if (diff <= 0) return 'now'
  const totalH = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (totalH >= 24) {
    const days = Math.floor(totalH / 24)
    const remainH = totalH % 24
    return remainH > 0 ? `${days}d${remainH}h` : `${days}d`
  }
  return totalH > 0 ? `${totalH}h${m}m` : `${m}m`
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

function fillRoundRect(dst: Buffer, w: number, h: number, r: number, c: RGB): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.max(r - x, x - (w - 1 - r), 0)
      const dy = Math.max(r - y, y - (h - 1 - r), 0)
      let a = 1
      if (dx > 0 && dy > 0) {
        const dist = Math.hypot(dx, dy)
        a = dist <= r ? 1 : 0
      }
      if (a <= 0) continue
      const d = (y * w + x) * 4
      dst[d] = c[0]
      dst[d + 1] = c[1]
      dst[d + 2] = c[2]
      dst[d + 3] = 255
    }
  }
}

function blendRect(dst: Buffer, w: number, h: number, x0: number, y0: number, x1: number, y1: number, c: RGB, alpha: number): void {
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const d = (y * w + x) * 4
      dst[d] = Math.round(c[0] * alpha + dst[d] * (1 - alpha))
      dst[d + 1] = Math.round(c[1] * alpha + dst[d + 1] * (1 - alpha))
      dst[d + 2] = Math.round(c[2] * alpha + dst[d + 2] * (1 - alpha))
    }
  }
}

export interface UsageGaugeData {
  provider: ProviderId
  /** "5H", "7D", or a scoped model label like "FABLE". */
  label: string
  /** False before the first usage_update has ever arrived, or after a
   *  disconnect invalidated it — renders a dim "—" instead of a number
   *  (fail-safe: never show a number that might be stale/wrong). */
  known: boolean
  usedPercent?: number
  resetsAt?: string
  /** The window itself has ended (Codex-style stale snapshot). */
  stale?: boolean
  /** An informational, non-binding scoped cap — cyan instead of the alarm ramp. */
  inactive?: boolean
}

/** Render a usage gauge tile (144×144 → base64 PNG). */
export function renderUsageGauge(data: UsageGaugeData, frame: number): string {
  const dst = Buffer.alloc(TILE * TILE * 4)
  fillRoundRect(dst, TILE, TILE, RADIUS, BG)

  if (!data.known || data.usedPercent === undefined) {
    drawText(dst, TILE, TILE, 14, 16, data.label, { size: 24, color: LABEL_DIM })
    drawCreatureInto(dst, TILE, TILE, data.provider, 'offline', frame, TILE - 40, 8, 1.2)
    drawText(dst, TILE, TILE, TILE / 2, 78, '—', { size: 40, color: TEXT_DIM, align: 'center' })
    return encodePng(dst, TILE, TILE)
  }

  const used = clampPct(data.usedPercent)
  const stale = data.stale === true
  const ramp = rampColor(used, stale, data.inactive === true)
  const fillH = Math.round((TILE * used) / 100)
  const fillY = TILE - fillH
  if (fillH > 0) {
    blendRect(dst, TILE, TILE, 0, fillY, TILE, TILE, ramp, stale ? 0.22 : 0.38)
    blendRect(dst, TILE, TILE, 0, fillY, TILE, fillY + 3, ramp, 1)
  }

  const dim = stale
  drawText(dst, TILE, TILE, 14, 16, data.label, { size: 24, color: dim ? LABEL_DIM : HEADLINE })
  drawCreatureInto(dst, TILE, TILE, data.provider, 'idle', frame, TILE - 40, 8, 1.2)

  const pctText = `${Math.round(used)}%`
  drawText(dst, TILE, TILE, TILE / 2, 70, pctText, {
    size: 40,
    color: dim ? LABEL_DIM : HEADLINE,
    align: 'center',
  })

  const reset = stale ? 'stale' : formatResetTime(data.resetsAt)
  if (reset) {
    drawText(dst, TILE, TILE, TILE / 2, 116, reset, {
      size: 16,
      color: dim ? LABEL_DIM : HEADLINE,
      align: 'center',
    })
  }

  return encodePng(dst, TILE, TILE)
}

/** Text-only width helper re-exported for callers that need to pre-measure. */
export { measureText }
