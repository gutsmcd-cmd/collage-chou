import type { Photo } from './layout'

const MAX_SIDE = 2048

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // EXIF orientation is applied here.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      await img.decode()
      return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}

/** Decode a photo and keep a copy no larger than the export size. */
export async function loadPhoto(file: File): Promise<Photo> {
  const img = await decode(file)
  const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * s))
  const h = Math.max(1, Math.round(img.height * s))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  if ('close' in img && typeof img.close === 'function') img.close()
  return { src: c, w, h }
}
