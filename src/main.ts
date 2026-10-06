import './style.css'
import { askPersist, load, save } from './db'
import { dict, type Dict, type Lang } from './i18n'
import { BGS, GAPS, LAYOUTS, SHAPES, cellRects, drawCover, suggestLayout, type Photo } from './layout'
import { loadPhoto } from './photos'

const DB = 'collage-chou'
const MAX = 6

type Settings = { layout: number; shape: number; gap: number; bg: number }

let lang: Lang = 'ja'
let t: Dict = dict.ja
let set: Settings = { layout: 0, shape: 0, gap: 1, bg: 0 }
let slots: (Photo | null)[] = Array.from({ length: MAX }, () => null)
let selected = -1
let note = ''
let busy = false
let replaceAt = -1

let exportBlob: Blob | null = null
let exportTimer = 0

const canShareFiles = (() => {
  try {
    const f = new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' })
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] })
  } catch {
    return false
  }
})()

// ---------- DOM ----------
const app = document.querySelector<HTMLDivElement>('#app')!

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text) n.textContent = text
  return n
}
function btn(cls: string): HTMLButtonElement {
  const b = el('button', cls)
  b.type = 'button'
  return b
}

const header = el('header', 'top')
const titles = el('div')
const h1 = el('h1')
const lead = el('p', 'lead')
titles.append(h1, lead)
const langBtn = btn('pill')
header.append(titles, langBtn)

const previewWrap = el('div', 'preview-wrap')
const preview = el('canvas', 'preview')
const emptyPick = btn('empty-pick')
previewWrap.append(preview, emptyPick)

const selBar = el('div', 'selbar')
const selText = el('p', 'seltext')
const selBtns = el('div', 'row')
const replaceBtn = btn('small')
const removeBtn = btn('small')
const cancelBtn = btn('small')
selBtns.append(replaceBtn, removeBtn, cancelBtn)
selBar.append(selText, selBtns)

const noteEl = el('p', 'note')
const pickBtn = btn('wide')

function segment(count: number, cls = ''): { box: HTMLDivElement; label: HTMLSpanElement; items: HTMLButtonElement[] } {
  const box = el('div', 'group')
  const label = el('span', 'glabel')
  const row = el('div', `seg ${cls}`)
  row.setAttribute('role', 'radiogroup')
  const items = Array.from({ length: count }, () => {
    const b = btn('opt')
    b.setAttribute('role', 'radio')
    row.append(b)
    return b
  })
  box.append(label, row)
  return { box, label, items }
}

const segLayout = segment(LAYOUTS.length, 'layouts')
segLayout.items.forEach((b, i) => {
  const L = LAYOUTS[i]
  const mini = el('span', 'mini')
  mini.style.gridTemplateColumns = `repeat(${L.cols}, 1fr)`
  mini.style.gridTemplateRows = `repeat(${L.rows}, 1fr)`
  for (const [c, r, cs, rs] of L.cells) {
    const cell = el('i')
    cell.style.gridArea = `${r + 1} / ${c + 1} / span ${rs} / span ${cs}`
    mini.append(cell)
  }
  b.append(mini)
})
const segShape = segment(SHAPES.length)
const segGap = segment(GAPS.length)
const segBg = segment(BGS.length)
segBg.items.forEach((b, i) => {
  const sw = el('span', 'swatch')
  sw.style.background = BGS[i]
  b.append(sw, el('span', 'bglabel'))
})

const settings = el('div', 'settings')
settings.append(segLayout.box, segShape.box, segGap.box, segBg.box)

const privacy = el('p', 'privacy')

const actions = el('div', 'actions')
const shareBtn = btn('big primary')
const dlBtn = btn('big')
shareBtn.hidden = !canShareFiles
if (canShareFiles) dlBtn.classList.remove('primary')
else dlBtn.classList.add('primary')
actions.append(shareBtn, dlBtn)

const main = el('main', 'wrap')
main.append(header, previewWrap, selBar, noteEl, pickBtn, settings, privacy)
app.append(main, actions)

const multiInput = el('input')
multiInput.type = 'file'
multiInput.accept = 'image/*'
multiInput.multiple = true
multiInput.hidden = true
const oneInput = el('input')
oneInput.type = 'file'
oneInput.accept = 'image/*'
oneInput.hidden = true
app.append(multiInput, oneInput)

// ---------- render ----------
function cellCount(): number {
  return LAYOUTS[set.layout].cells.length
}
function hasPhotos(): boolean {
  return slots.slice(0, cellCount()).some(Boolean)
}

function renderText(): void {
  document.documentElement.lang = lang
  document.title = t.app
  h1.textContent = t.app
  lead.textContent = t.lead
  langBtn.textContent = t.toggle
  langBtn.lang = lang === 'ja' ? 'en' : 'ja'
  emptyPick.innerHTML = ''
  emptyPick.append(el('strong', '', t.pick), el('span', '', t.pickHint))
  pickBtn.textContent = slots.some(Boolean) ? t.pickMore : t.pick
  selText.textContent = t.selected
  replaceBtn.textContent = t.replace
  removeBtn.textContent = t.remove
  cancelBtn.textContent = t.cancel
  segLayout.label.textContent = t.layout
  segLayout.items.forEach((b, i) => {
    b.setAttribute('aria-label', t.layouts[i])
    b.title = t.layouts[i]
  })
  segShape.label.textContent = t.shape
  segShape.items.forEach((b, i) => (b.textContent = t.shapes[i]))
  segGap.label.textContent = t.gap
  segGap.items.forEach((b, i) => (b.textContent = t.gaps[i]))
  segBg.label.textContent = t.bg
  segBg.items.forEach((b, i) => (b.querySelector('.bglabel')!.textContent = t.bgs[i]))
  privacy.textContent = t.privacy
  shareBtn.textContent = t.share
  dlBtn.textContent = t.download
}

function render(): void {
  renderText()
  const marks: [ReturnType<typeof segment>, number][] = [
    [segLayout, set.layout],
    [segShape, set.shape],
    [segGap, set.gap],
    [segBg, set.bg],
  ]
  for (const [seg, v] of marks) seg.items.forEach((b, i) => b.setAttribute('aria-checked', String(i === v)))
  const any = slots.some(Boolean)
  emptyPick.hidden = any || busy
  pickBtn.hidden = !any && !busy
  selBar.hidden = selected < 0
  const unused = slots.slice(cellCount()).filter(Boolean).length
  noteEl.textContent = busy ? t.loading : note || (unused ? t.unused(unused) : '')
  noteEl.hidden = !noteEl.textContent
  shareBtn.disabled = dlBtn.disabled = !hasPhotos() || busy
  drawPreview()
}

function drawCollage(ctx: CanvasRenderingContext2D, W: number, H: number, forPreview: boolean): void {
  ctx.fillStyle = BGS[set.bg]
  ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingQuality = 'high'
  const rects = cellRects(LAYOUTS[set.layout], W, H, GAPS[set.gap])
  rects.forEach((r, i) => {
    const p = slots[i]
    if (p) drawCover(ctx, p, r)
    else if (forPreview) {
      ctx.fillStyle = set.bg === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(44,38,31,0.08)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      const s = Math.min(r.w, r.h) * 0.16
      ctx.strokeStyle = set.bg === 1 ? 'rgba(255,255,255,0.6)' : 'rgba(44,38,31,0.45)'
      ctx.lineWidth = Math.max(2, s * 0.14)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(r.x + r.w / 2 - s / 2, r.y + r.h / 2)
      ctx.lineTo(r.x + r.w / 2 + s / 2, r.y + r.h / 2)
      ctx.moveTo(r.x + r.w / 2, r.y + r.h / 2 - s / 2)
      ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2 + s / 2)
      ctx.stroke()
    }
    if (forPreview && i === selected) {
      const lw = Math.max(4, Math.min(W, H) * 0.012)
      ctx.lineWidth = lw
      ctx.strokeStyle = '#e4b15c'
      ctx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw)
    }
  })
}

function previewSize(): { cw: number; ch: number } {
  const [W, H] = SHAPES[set.shape]
  const maxW = Math.min(previewWrap.clientWidth || 360, 520)
  const maxH = Math.max(240, window.innerHeight * 0.52)
  const s = Math.min(maxW / W, maxH / H)
  return { cw: Math.round(W * s), ch: Math.round(H * s) }
}

function drawPreview(): void {
  const { cw, ch } = previewSize()
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  preview.style.width = `${cw}px`
  preview.style.height = `${ch}px`
  preview.width = Math.round(cw * dpr)
  preview.height = Math.round(ch * dpr)
  drawCollage(preview.getContext('2d')!, preview.width, preview.height, true)
}

// ---------- export ----------
function invalidate(): void {
  exportBlob = null
  clearTimeout(exportTimer)
  if (hasPhotos()) exportTimer = window.setTimeout(() => void makeBlob(), 500)
}

let making: Promise<Blob | null> | null = null
function makeBlob(): Promise<Blob | null> {
  if (exportBlob) return Promise.resolve(exportBlob)
  if (making) return making
  const [W, H] = SHAPES[set.shape]
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  drawCollage(c.getContext('2d')!, W, H, false)
  making = new Promise<Blob | null>((resolve) =>
    c.toBlob((b) => {
      making = null
      exportBlob = b
      resolve(b)
    }, 'image/jpeg', 0.9),
  )
  return making
}

function fileName(): string {
  const n = new Date()
  const p = (v: number): string => String(v).padStart(2, '0')
  return `collage-${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}.jpg`
}

async function doShare(): Promise<void> {
  const ready = exportBlob
  const blob = ready ?? (await makeBlob())
  if (!blob) return
  const file = new File([blob], fileName(), { type: 'image/jpeg' })
  try {
    await navigator.share({ files: [file] })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'NotAllowedError' && !ready) {
      note = t.tapAgain
      render()
    } else if (name !== 'AbortError') {
      doDownload(blob)
    }
  }
}

function doDownload(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName()
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ---------- photos ----------
async function readFiles(files: File[]): Promise<Photo[]> {
  const out: Photo[] = []
  let bad = false
  for (const f of files) {
    try {
      out.push(await loadPhoto(f)) // one at a time keeps memory low
    } catch {
      bad = true
    }
  }
  if (bad) note = t.badFile
  return out
}

async function pickMany(files: File[]): Promise<void> {
  if (!files.length) return
  note = files.length > MAX ? t.tooMany : ''
  busy = true
  selected = -1
  render()
  const photos = await readFiles(files.slice(0, MAX))
  busy = false
  if (photos.length) {
    slots = Array.from({ length: MAX }, (_, i) => photos[i] ?? null)
    set.layout = suggestLayout(photos.length, set.layout)
    void save(DB, 'settings', set)
  }
  render()
  invalidate()
}

async function pickOne(i: number, file: File | undefined): Promise<void> {
  if (!file) return
  note = ''
  busy = true
  render()
  const [p] = await readFiles([file])
  busy = false
  if (p) slots[i] = p
  selected = -1
  render()
  invalidate()
}

function tapCell(i: number): void {
  note = ''
  if (selected >= 0) {
    if (i !== selected) {
      ;[slots[i], slots[selected]] = [slots[selected], slots[i]]
      invalidate()
    }
    selected = -1
  } else if (slots[i]) {
    selected = i
  } else {
    replaceAt = i
    oneInput.click()
  }
  render()
}

// ---------- events ----------
preview.addEventListener('click', (e) => {
  if (busy) return
  const box = preview.getBoundingClientRect()
  const x = ((e.clientX - box.left) / box.width) * preview.width
  const y = ((e.clientY - box.top) / box.height) * preview.height
  const rects = cellRects(LAYOUTS[set.layout], preview.width, preview.height, GAPS[set.gap])
  const hit = rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  if (hit >= 0) tapCell(hit)
})
emptyPick.addEventListener('click', () => multiInput.click())
pickBtn.addEventListener('click', () => multiInput.click())
multiInput.addEventListener('change', () => {
  const files = Array.from(multiInput.files ?? [])
  multiInput.value = ''
  void pickMany(files)
})
oneInput.addEventListener('change', () => {
  const file = oneInput.files?.[0]
  oneInput.value = ''
  void pickOne(replaceAt, file)
})
replaceBtn.addEventListener('click', () => {
  replaceAt = selected
  oneInput.click()
})
removeBtn.addEventListener('click', () => {
  if (selected >= 0) slots[selected] = null
  selected = -1
  render()
  invalidate()
})
cancelBtn.addEventListener('click', () => {
  selected = -1
  render()
})

function bindSeg(seg: ReturnType<typeof segment>, key: keyof Settings): void {
  seg.items.forEach((b, i) =>
    b.addEventListener('click', () => {
      set[key] = i
      selected = -1
      note = ''
      render()
      invalidate()
      void save(DB, 'settings', set)
    }),
  )
}
bindSeg(segLayout, 'layout')
bindSeg(segShape, 'shape')
bindSeg(segGap, 'gap')
bindSeg(segBg, 'bg')

langBtn.addEventListener('click', () => {
  lang = lang === 'ja' ? 'en' : 'ja'
  t = dict[lang]
  note = ''
  render()
  void save(DB, 'lang', lang)
})
shareBtn.addEventListener('click', () => void doShare())
dlBtn.addEventListener('click', async () => {
  const b = await makeBlob()
  if (b) doDownload(b)
})
let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(drawPreview, 120)
})

// ---------- boot ----------
async function boot(): Promise<void> {
  const l = await load<Lang>(DB, 'lang')
  if (l === 'ja' || l === 'en') {
    lang = l
    t = dict[lang]
  }
  const s = await load<Settings>(DB, 'settings')
  if (s && typeof s === 'object') {
    const ok = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n
    set = {
      layout: ok(s.layout, LAYOUTS.length) ? s.layout : 0,
      shape: ok(s.shape, SHAPES.length) ? s.shape : 0,
      gap: ok(s.gap, GAPS.length) ? s.gap : 1,
      bg: ok(s.bg, BGS.length) ? s.bg : 0,
    }
  }
  render()
  void askPersist()
}

render()
void boot()
