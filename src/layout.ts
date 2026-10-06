export type Cell = [col: number, row: number, colSpan: number, rowSpan: number]
export type Layout = { cols: number; rows: number; cells: Cell[] }

export const LAYOUTS: Layout[] = [
  { cols: 2, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
  { cols: 1, rows: 2, cells: [[0, 0, 1, 1], [0, 1, 1, 1]] },
  { cols: 2, rows: 2, cells: [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]] },
  { cols: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  {
    cols: 2,
    rows: 3,
    cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1]],
  },
]

/** Output sizes at ~2048px on the long side. */
export const SHAPES: [number, number][] = [
  [2048, 2048],
  [1638, 2048],
  [1152, 2048],
]

/** Gap as a fraction of the long side. */
export const GAPS = [0, 0.008, 0.024]
export const BGS = ['#ffffff', '#111111', '#f6f1e3']

export type Rect = { x: number; y: number; w: number; h: number }

export function cellRects(layout: Layout, W: number, H: number, gapFrac: number): Rect[] {
  const g = Math.round(Math.max(W, H) * gapFrac)
  const cw = (W - g * (layout.cols + 1)) / layout.cols
  const ch = (H - g * (layout.rows + 1)) / layout.rows
  return layout.cells.map(([c, r, cs, rs]) => ({
    x: g + c * (cw + g),
    y: g + r * (ch + g),
    w: cs * cw + (cs - 1) * g,
    h: rs * ch + (rs - 1) * g,
  }))
}

export type Photo = { src: HTMLCanvasElement; w: number; h: number }

/** Draw an image so it covers the rect, cropped from the center. */
export function drawCover(ctx: CanvasRenderingContext2D, p: Photo, r: Rect): void {
  const s = Math.max(r.w / p.w, r.h / p.h)
  const sw = r.w / s
  const sh = r.h / s
  const sx = (p.w - sw) / 2
  const sy = (p.h - sh) / 2
  ctx.drawImage(p.src, sx, sy, sw, sh, r.x, r.y, r.w, r.h)
}

export function suggestLayout(count: number, current: number): number {
  if (count <= 2) return current <= 1 ? current : 0
  if (count === 3) return 2
  if (count === 4) return 3
  return 4
}
