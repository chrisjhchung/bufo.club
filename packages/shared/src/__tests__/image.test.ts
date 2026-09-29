import { describe, expect, it } from 'vitest'
import { readImageInfo } from '../image'

function png(width: number, height: number, extraChunks: string[] = []): Uint8Array {
  const chunks: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const pushChunk = (type: string, body: number[]) => {
    chunks.push(
      (body.length >>> 24) & 0xff,
      (body.length >>> 16) & 0xff,
      (body.length >>> 8) & 0xff,
      body.length & 0xff,
    )
    for (const char of type) chunks.push(char.charCodeAt(0))
    chunks.push(...body)
    chunks.push(0, 0, 0, 0) // CRC, unread by the parser
  }
  const be32 = (value: number) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
  pushChunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0])
  for (const type of extraChunks) pushChunk(type, [0, 0, 0, 0])
  pushChunk('IDAT', [0])
  return new Uint8Array(chunks)
}

function gif(width: number, height: number, frames: number): Uint8Array {
  const bytes = [...'GIF89a'].map((c) => c.charCodeAt(0))
  bytes.push(width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff, 0, 0, 0)
  for (let i = 0; i < frames; i++) bytes.push(0x21, 0xf9, 0x04, 0, 0, 0, 0, 0x00, 0x2c)
  return new Uint8Array(bytes)
}

function webpVP8X(width: number, height: number, animated: boolean): Uint8Array {
  const bytes = new Uint8Array(40)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  write(0, 'RIFF')
  write(8, 'WEBP')
  write(12, 'VP8X')
  bytes[20] = animated ? 0x02 : 0x00
  const w = width - 1
  const h = height - 1
  bytes[24] = w & 0xff
  bytes[25] = (w >> 8) & 0xff
  bytes[26] = (w >> 16) & 0xff
  bytes[27] = h & 0xff
  bytes[28] = (h >> 8) & 0xff
  bytes[29] = (h >> 16) & 0xff
  return bytes
}

describe('readImageInfo', () => {
  it('reads PNG dimensions', () => {
    expect(readImageInfo(png(128, 128))).toEqual({
      ext: 'png',
      width: 128,
      height: 128,
      isAnimated: false,
    })
  })

  it('detects APNG via acTL before IDAT', () => {
    expect(readImageInfo(png(64, 64, ['acTL'])!)?.isAnimated).toBe(true)
  })

  it('reads GIF dimensions and animation', () => {
    expect(readImageInfo(gif(96, 72, 1))).toMatchObject({
      ext: 'gif',
      width: 96,
      height: 72,
      isAnimated: false,
    })
    expect(readImageInfo(gif(96, 72, 3))?.isAnimated).toBe(true)
  })

  it('reads extended WebP', () => {
    expect(readImageInfo(webpVP8X(200, 150, true))).toEqual({
      ext: 'webp',
      width: 200,
      height: 150,
      isAnimated: true,
    })
  })

  it('rejects non-images and text renamed to .png', () => {
    expect(
      readImageInfo(new TextEncoder().encode('this is definitely not a png at all')),
    ).toBeNull()
    expect(
      readImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBeNull()
  })
})
