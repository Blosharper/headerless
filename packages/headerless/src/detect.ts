import type { Format } from './types'

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Identify a format by magic bytes. Extensions are not trusted.
 * Returns null when no parser exists — callers must treat that as a build failure.
 */
export function detect(buf: Uint8Array): Format | null {
  if (PNG_SIG.every((b, i) => buf[i] === b)) return 'png'

  // JPEG: SOI marker
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'

  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp'
  }

  return null
}
