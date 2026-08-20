import type { ProviderStatus } from '../state/stateMapper.js'
import type { ProviderId } from '../agentdeck/mapper.js'
import { encodePng, drawCreatureInto } from './pet.js'
import { compositeBaimiInto } from './baimi.js'
import { drawText, measureText } from './text.js'
import { withBlink } from './blink.js'

/**
 * Rich session tile — the official AgentDeck Stream Deck look: rounded dark key
 * with a corner status arc, big status word, provider name, the creature, a
 * model label, and an "ACT" badge. Rendered at 2× (144px) for crisp downscaling.
 */

type RGB = [number, number, number]

const TILE = 144
const RADIUS = 18

const BG: RGB = [0x16, 0x19, 0x20] // near-black key
const BORDER: RGB = [0x2b, 0x3a, 0x46] // subtle blue-grey inset border
const WHITE: RGB = [0xf2, 0xf4, 0xf8]
const PILL_BG: RGB = [0x3a, 0x40, 0x4a]
const PILL_TX: RGB = [0xc7, 0xcf, 0xd8]

const ACCENT: Record<ProviderId, RGB> = {
  codex: [0x8b, 0x8e, 0xf5],
  claude: [0xc0, 0x70, 0x58],
  gemini: [0x7f, 0xa6, 0xff],
  openclaw: [0xff, 0x6b, 0x6b],
  opencode: [0xd8, 0xd2, 0xd2],
  antigravity: [0x24, 0x7e, 0xff], // one representative hue from its rainbow mark
  kiro: [0x6a, 0x8f, 0xa0],
}

/** Status word colour: attention states override the provider accent. */
function statusColor(status: ProviderStatus, accent: RGB): RGB {
  switch (status) {
    case 'working':
      return [0x3d, 0xc9, 0xd8]
    case 'approval':
      return [0xff, 0xb0, 0x3a]
    case 'error':
      return [0xff, 0x5a, 0x50]
    case 'done':
      return [0x4a, 0xd0, 0x7a]
    case 'offline':
      return [0x6a, 0x72, 0x7e]
    default:
      return accent
  }
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

/** Bright flash color for the approval/input/review blink — see withBlink(). */
const ATTENTION_FLASH: RGB = [0xff, 0x3b, 0x30]

/** Key background colour — tints toward the status colour so the whole tile,
 *  not just the border/text, visibly shifts (most notably teal while working).
 *  `frame` bakes in the "needs your response" blink directly: the tile fills
 *  the whole key with only its rounded corners left transparent, so a plain
 *  Companion boolean feedback stacked underneath can only ever flash those
 *  four corner triangles — baking it into this fill flashes the whole key. */
function tileBg(status: ProviderStatus, accent: RGB, frame: number): RGB {
  const base: RGB = (() => {
    switch (status) {
      case 'working':
        return [0x0a, 0x33, 0x38] // teal-tinted dark — strongest, matches pet bg
      case 'approval':
        return [0x3a, 0x2a, 0x08]
      case 'error':
        return [0x3a, 0x12, 0x12]
      case 'done':
        return [0x0d, 0x2e, 0x1c]
      case 'offline':
        return BG
      default:
        return lerp(BG, accent, 0.06) // idle/input/review: faint accent tint
    }
  })()
  return withBlink(status, frame, base, ATTENTION_FLASH)
}

function blend(dst: Buffer, dw: number, dh: number, x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= dw || y >= dh || a <= 0) return
  const d = (y * dw + x) * 4
  const t = Math.min(1, a)
  dst[d] = Math.round(c[0] * t + dst[d] * (1 - t))
  dst[d + 1] = Math.round(c[1] * t + dst[d + 1] * (1 - t))
  dst[d + 2] = Math.round(c[2] * t + dst[d + 2] * (1 - t))
  dst[d + 3] = Math.max(dst[d + 3], Math.round(255 * t))
}

/** Rounded-rect signed helper: distance-outside (0 inside). */
function roundRectAlpha(px: number, py: number, x: number, y: number, w: number, h: number, r: number): number {
  const dx = Math.max(x - px, px - (x + w - 1), 0)
  const dy = Math.max(y - py, py - (y + h - 1), 0)
  // inside straight edges
  if (dx === 0 && dy === 0) {
    // corner rounding: check distance to nearest corner circle centre
    const cxs = [x + r, x + w - 1 - r]
    const cys = [y + r, y + h - 1 - r]
    let inCorner = false
    let alpha = 1
    for (const cx of cxs) {
      for (const cy of cys) {
        const inCx = (cx === x + r && px < cx) || (cx === x + w - 1 - r && px > cx)
        const inCy = (cy === y + r && py < cy) || (cy === y + h - 1 - r && py > cy)
        if (inCx && inCy) {
          inCorner = true
          const dist = Math.hypot(px - cx, py - cy)
          alpha = Math.min(alpha, Math.max(0, Math.min(1, r - dist + 0.5)))
        }
      }
    }
    return inCorner ? alpha : 1
  }
  return 0
}

function fillRoundRect(dst: Buffer, dw: number, dh: number, x: number, y: number, w: number, h: number, r: number, c: RGB, alpha = 1): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const a = roundRectAlpha(px, py, x, y, w, h, r) * alpha
      if (a > 0) blend(dst, dw, dh, px, py, c, a)
    }
  }
}

/** Draw an inset rounded-rect outline; `topLeftBright` overpaints the top-left
 *  arc in the accent colour (the official corner status stroke). */
function drawBorder(dst: Buffer, dw: number, dh: number, accent: RGB): void {
  const inset = 5
  const x = inset
  const y = inset
  const w = TILE - inset * 2
  const h = TILE - inset * 2
  const r = RADIUS - 3
  const thick = 3
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const outer = roundRectAlpha(px, py, x, y, w, h, r)
      const inner = roundRectAlpha(px, py, x + thick, y + thick, w - thick * 2, h - thick * 2, Math.max(1, r - thick))
      const ring = outer - inner
      if (ring <= 0.02) continue
      // top-left arc bright, rest dim
      const bright = px < TILE * 0.42 && py < TILE * 0.42
      const col = bright ? accent : BORDER
      blend(dst, dw, dh, px, py, col, ring * (bright ? 0.95 : 0.5))
    }
  }
}

export interface TileData {
  status: ProviderStatus
  name: string // provider display name, e.g. "Claude"
  model?: string
  act?: boolean
  /** Codex only: 'baimi' swaps the built-in cloud creature for the user's
   *  custom Codex avatar, matching the skin option on the pet feedback. */
  skin?: string
}

/** Largest size ≤ desired that fits `text` within `maxW`. */
function fitSize(text: string, desired: number, maxW: number, min = 9): number {
  let s = desired
  while (s > min && measureText(text, s) > maxW) s -= 1
  return s
}

export function renderTile(provider: ProviderId, data: TileData, frame: number): string {
  const accent = ACCENT[provider]
  const dst = Buffer.alloc(TILE * TILE * 4) // transparent
  // key background (rounded → corners stay transparent so the key looks rounded)
  // Tinted per status so the whole key visibly shifts, not just the border/text.
  fillRoundRect(dst, TILE, TILE, 0, 0, TILE, TILE, RADIUS, tileBg(data.status, accent, frame), 1)
  drawBorder(dst, TILE, TILE, statusColor(data.status, accent))

  // creature — right/centre, 24×24 grid (or the custom Codex avatar skin)
  const cell = 2.8
  const cw = 24 * cell
  const creatureX = TILE - cw - 4
  if (provider === 'codex' && data.skin === 'baimi') {
    compositeBaimiInto(dst, TILE, TILE, data.status, frame, creatureX, 50, cw)
  } else {
    drawCreatureInto(dst, TILE, TILE, provider, data.status, frame, creatureX, 50, cell)
  }

  // ACT pill (top-right) — compute geometry first so the status word can avoid it
  let pillLeft = TILE - 12
  if (data.act) {
    const label = 'ACT'
    const ts = 15
    const padX = 8
    const pw = Math.round(measureText(label, ts) + padX * 2)
    const ph = 24
    const px = TILE - pw - 12
    const py = 12
    fillRoundRect(dst, TILE, TILE, px, py, pw, ph, ph / 2, PILL_BG, 0.9)
    drawText(dst, TILE, TILE, px + padX, py + 3, label, { size: ts, color: PILL_TX })
    pillLeft = px
  }

  // status word (top-left) — fit to the space left of the pill
  const statusWord = data.status.toUpperCase()
  const statusSize = fitSize(statusWord, 26, pillLeft - 14 - 6)
  drawText(dst, TILE, TILE, 14, 16, statusWord, {
    size: statusSize,
    color: statusColor(data.status, accent),
  })
  // provider name — fit to the space left of the creature
  const nameSize = fitSize(data.name, 30, creatureX - 14 - 2)
  drawText(dst, TILE, TILE, 14, 46, data.name, { size: nameSize, color: WHITE })
  // model (bottom-left) — fit to full width
  if (data.model) {
    const modelSize = fitSize(data.model, 22, TILE - 14 - 12)
    drawText(dst, TILE, TILE, 14, TILE - 30, data.model, { size: modelSize, color: accent })
  }

  return encodePng(dst, TILE, TILE)
}
