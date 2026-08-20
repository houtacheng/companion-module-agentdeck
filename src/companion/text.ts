import { gunzipSync } from 'node:zlib'
import {
  FONT_W,
  FONT_H,
  FONT_BASE,
  FONT_SPACE,
  FONT_GLYPHS,
  FONT_ALPHA_GZ,
} from './font-atlas.generated.js'

/**
 * Bitmap-font text renderer for the rich tile. The atlas is a bold system-sans
 * face rasterised once via canvas (`font-atlas.generated.ts`); here we gunzip
 * its alpha coverage and blit scaled, alpha-blended glyphs onto an RGBA buffer.
 * Font was drawn at 32px, so `size` is in the same px units.
 */

type RGB = [number, number, number]
const EM = FONT_BASE // 32px reference

let atlas: Uint8Array | null = null
function alphaAtlas(): Uint8Array {
  if (!atlas) atlas = new Uint8Array(gunzipSync(Buffer.from(FONT_ALPHA_GZ, 'base64')))
  return atlas
}

function sampleAlpha(ax: number, ay: number): number {
  // bilinear sample of the alpha atlas (clamped)
  const x0 = Math.floor(ax)
  const y0 = Math.floor(ay)
  const x1 = Math.min(x0 + 1, FONT_W - 1)
  const y1 = Math.min(y0 + 1, FONT_H - 1)
  if (x0 < 0 || y0 < 0 || x0 >= FONT_W || y0 >= FONT_H) return 0
  const fx = ax - x0
  const fy = ay - y0
  const A = alphaAtlas()
  const a00 = A[y0 * FONT_W + x0]
  const a10 = A[y0 * FONT_W + x1]
  const a01 = A[y1 * FONT_W + x0]
  const a11 = A[y1 * FONT_W + x1]
  const top = a00 + (a10 - a00) * fx
  const bot = a01 + (a11 - a01) * fx
  return top + (bot - top) * fy
}

/** Width of a string at the given px size. */
export function measureText(text: string, size: number): number {
  const s = size / EM
  let w = 0
  for (const ch of text) {
    if (ch === ' ') { w += FONT_SPACE * s; continue }
    const g = FONT_GLYPHS[ch]
    w += (g ? g[2] : FONT_SPACE) * s
  }
  return w
}

export interface TextOpts {
  size: number // px (32 = native)
  color: RGB
  align?: 'left' | 'center' | 'right'
  alpha?: number // 0..1 overall opacity
}

/**
 * Draw `text` onto an RGBA buffer. `x,y` is the top-left of the text box (y is
 * the cell top; the visible baseline sits `FONT_BASE*scale` below it).
 */
export function drawText(
  dst: Buffer,
  dw: number,
  dh: number,
  x: number,
  y: number,
  text: string,
  opts: TextOpts,
): number {
  const s = opts.size / EM
  const cellH = FONT_H * s
  const total = measureText(text, opts.size)
  let penX = x
  if (opts.align === 'center') penX = x - total / 2
  else if (opts.align === 'right') penX = x - total
  const globalA = opts.alpha ?? 1
  const [cr, cg, cb] = opts.color

  for (const ch of text) {
    if (ch === ' ') { penX += FONT_SPACE * s; continue }
    const g = FONT_GLYPHS[ch]
    if (!g) { penX += FONT_SPACE * s; continue }
    const [gx, gw] = g
    const dwidth = gw * s
    for (let py = 0; py < cellH; py++) {
      const ay = (py / cellH) * FONT_H
      const dyi = Math.round(y + py)
      if (dyi < 0 || dyi >= dh) continue
      for (let px = 0; px < dwidth; px++) {
        const ax = gx + (px / dwidth) * gw
        const a = (sampleAlpha(ax, ay) / 255) * globalA
        if (a <= 0.01) continue
        const dxi = Math.round(penX + px)
        if (dxi < 0 || dxi >= dw) continue
        const d = (dyi * dw + dxi) * 4
        dst[d] = Math.round(cr * a + dst[d] * (1 - a))
        dst[d + 1] = Math.round(cg * a + dst[d + 1] * (1 - a))
        dst[d + 2] = Math.round(cb * a + dst[d + 2] * (1 - a))
      }
    }
    penX += g[2] * s
  }
  return total
}
