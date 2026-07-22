import { describe, expect, it } from 'vitest'
import { detect } from '../src/detect'

describe('detect', () => {
  it('detects PNG format by signature', () => {
    const pngBuf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    expect(detect(pngBuf)).toBe('png')
  })

  it('detects JPEG format by SOI marker', () => {
    const jpegBuf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(detect(jpegBuf)).toBe('jpeg')
  })

  it('detects WebP format by RIFF header', () => {
    const webpBuf = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x00, 0x00, 0x00, 0x00, // length
      0x57, 0x45, 0x42, 0x50  // "WEBP"
    ])
    expect(detect(webpBuf)).toBe('webp')
  })

  it('returns null for unknown byte signatures', () => {
    const unknownBuf = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])
    expect(detect(unknownBuf)).toBeNull()
  })
})
