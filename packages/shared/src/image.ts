import { BUFO_EXTENSIONS, type BufoExt } from './constants'

export type ImageInfo = {
  ext: BufoExt
  width: number
  height: number
  isAnimated: boolean
}

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

const u32be = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0

const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8)

const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Identify an image from its header bytes only — never from a client-supplied
 * filename or Content-Type. No pixel decoding, so this stays well inside the
 * Workers free-plan 10ms CPU budget even for the largest allowed upload.
 *
 * Returns null when the bytes are not a supported bufo image.
 */
export function readImageInfo(input: Uint8Array | ArrayBuffer): ImageInfo | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)

  if (b.length >= 24 && PNG_MAGIC.every((byte, i) => b[i] === byte)) {
    // IHDR is required to be the first chunk: length+type occupy bytes 8..16.
    if (ascii(b, 12, 4) !== 'IHDR') return null
    return {
      ext: 'png',
      width: u32be(b, 16),
      height: u32be(b, 20),
      // APNG advertises itself with an acTL chunk ahead of the first IDAT.
      isAnimated: hasApngControlChunk(b),
    }
  }

  if (b.length >= 10) {
    const magic = ascii(b, 0, 6)
    if (magic === 'GIF87a' || magic === 'GIF89a') {
      return {
        ext: 'gif',
        width: u16le(b, 6),
        height: u16le(b, 8),
        isAnimated: countGifFrames(b) > 1,
      }
    }
  }

  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    return readWebp(b)
  }

  return null
}

function hasApngControlChunk(b: Uint8Array): boolean {
  // Walk chunk headers rather than scanning raw bytes: 'acTL' could otherwise
  // appear by chance inside compressed pixel data.
  let offset = 8
  while (offset + 8 <= b.length) {
    const length = u32be(b, offset)
    const type = ascii(b, offset + 4, 4)
    if (type === 'acTL') return true
    if (type === 'IDAT' || type === 'IEND') return false
    offset += 12 + length
  }
  return false
}

function countGifFrames(b: Uint8Array): number {
  // Graphic Control Extension (0x21 0xF9) precedes each rendered frame.
  let frames = 0
  for (let i = 0; i + 1 < b.length && frames < 2; i++) {
    if (b[i] === 0x21 && b[i + 1] === 0xf9) frames++
  }
  return frames
}

function readWebp(b: Uint8Array): ImageInfo | null {
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8X') {
    return {
      ext: 'webp',
      width: u24le(b, 24) + 1,
      height: u24le(b, 27) + 1,
      isAnimated: (b[20]! & 0x02) !== 0,
    }
  }
  if (chunk === 'VP8 ') {
    // Lossless-free simple format: 14-bit dimensions after the 3-byte sync code.
    return {
      ext: 'webp',
      width: u16le(b, 26) & 0x3fff,
      height: u16le(b, 28) & 0x3fff,
      isAnimated: false,
    }
  }
  if (chunk === 'VP8L') {
    // After the 0x2f signature byte, 32 packed bits hold width-1 (14b) then
    // height-1 (14b), least significant bit first.
    const packed = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
    return {
      ext: 'webp',
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
      isAnimated: false,
    }
  }
  return null
}

export function isBufoExt(value: string): value is BufoExt {
  return (BUFO_EXTENSIONS as readonly string[]).includes(value)
}

/** Lowercase hex SHA-256, used for upload de-duplication. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
