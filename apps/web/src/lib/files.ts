import { canvasToBlob, createCanvas } from '@bufo/gen'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Download images through fetch rather than a bare <a download>: the images
 * live on the R2 custom domain, and a cross-origin anchor would navigate to
 * the file instead of saving it.
 *
 * `cache: 'reload'` is deliberate. Images are displayed as ordinary <img>
 * loads, which cache a response carrying no Access-Control-Allow-Origin; a
 * CORS fetch of the same URL would reuse that entry and fail the check without
 * ever reaching the network. Forcing a fresh request keeps the two apart.
 */
export async function fetchBlob(url: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(url, { mode: 'cors', cache: 'reload' })
  } catch {
    // fetch() rejects with a bare TypeError for both a dead network and a
    // CORS refusal, and "Failed to fetch" tells nobody anything.
    throw new Error('could not reach the image server — check your connection and retry')
  }
  if (!response.ok) throw new Error(`the image server returned ${response.status}`)
  return response.blob()
}

/** Re-render an image at a square emoji size, entirely in the browser. */
export async function resizeToSquare(blob: Blob, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('2d canvas unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Letterbox rather than distort: emoji are square, bufos are not always.
  const scale = Math.min(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  return canvasToBlob(canvas)
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/** Copy an image to the clipboard where the browser allows it. */
export async function copyImage(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('this browser cannot copy images')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
