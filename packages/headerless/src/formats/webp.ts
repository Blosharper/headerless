import { ParseError, UnsupportedFormatError } from '../types'
import type { HeaderSpec } from '../types'

// WebP layout:
//   [0..4)   "RIFF"                constant
//   [4..8)   riff size (LE)        unique
//   [8..12)  "WEBP"                constant
//   [12..16) chunk fourCC          constant per subformat
//   [16..20) chunk size (LE)       unique
//   VP8  (lossy):    [20..23) frame tag  unique
//                    [23..26) start code 9D 01 2A  constant
//                    [26..30) width/height (14-bit + scaling)  unique
//   VP8L (lossless): [20]     signature 0x2F  constant
//                    [21..25) width/height/alpha/version bits  unique
//
// The frame tag varies per file (first-partition size), and the dimension
// fields are what a decoder cannot live without. Size fields are stored too —
// cheaper than reasoning about RIFF padding on restore.
const FOURCC_VP8 = [0x56, 0x50, 0x38, 0x20] // "VP8 "
const FOURCC_VP8L = [0x56, 0x50, 0x38, 0x4c] // "VP8L"
const VP8_START_CODE = [0x9d, 0x01, 0x2a]

export const VP8_CUT_LENGTH = 30
export const VP8_UNIQUE_LENGTH = 15 // riffSize 4 + chunkSize 4 + frameTag 3 + dims 4
export const VP8L_CUT_LENGTH = 25
export const VP8L_UNIQUE_LENGTH = 12 // riffSize 4 + chunkSize 4 + dims 4

function fourccAt(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3])
}

export function locateWebp(buf: Uint8Array, path: string): HeaderSpec {
  const fourcc = fourccAt(buf, 12)
  if (fourcc === 'VP8X') {
    throw new UnsupportedFormatError(
      path,
      'extended WebP (VP8X) is not supported yet — cutting only the VP8X chunk would ' +
        'leave the inner frame header restorable, which violates the key rule. ' +
        're-encode as plain lossy/lossless WebP'
    )
  }
  if (fourcc === 'VP8 ') {
    if (buf.length < VP8_CUT_LENGTH) throw new ParseError(path, 'file shorter than the VP8 frame header')
    if (!VP8_START_CODE.every((b, i) => buf[23 + i] === b)) {
      throw new ParseError(path, 'VP8 start code not found where expected')
    }
    return {
      format: 'webp',
      start: 0,
      cutLength: VP8_CUT_LENGTH,
      unique: [
        { offset: 4, length: 4 },
        { offset: 16, length: 4 },
        { offset: 20, length: 3 },
        { offset: 26, length: 4 }
      ]
    }
  }
  if (fourcc === 'VP8L') {
    if (buf.length < VP8L_CUT_LENGTH) throw new ParseError(path, 'file shorter than the VP8L header')
    if (buf[20] !== 0x2f) throw new ParseError(path, 'VP8L signature byte not found')
    return {
      format: 'webp',
      start: 0,
      cutLength: VP8L_CUT_LENGTH,
      unique: [
        { offset: 4, length: 4 },
        { offset: 16, length: 4 },
        { offset: 21, length: 4 }
      ]
    }
  }
  throw new ParseError(path, `unknown WebP chunk "${fourcc}"`)
}

/**
 * Rebuild the cut bytes from the stored ones. The two subformats have distinct
 * fixed fragment lengths, which is what tells them apart here.
 */
export function rebuildWebp(unique: Uint8Array): Uint8Array {
  if (unique.length === VP8_UNIQUE_LENGTH) {
    const cut = new Uint8Array(VP8_CUT_LENGTH)
    cut.set([0x52, 0x49, 0x46, 0x46], 0) // "RIFF"
    cut.set(unique.subarray(0, 4), 4)
    cut.set([0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
    cut.set(FOURCC_VP8, 12)
    cut.set(unique.subarray(4, 8), 16)
    cut.set(unique.subarray(8, 11), 20)
    cut.set(VP8_START_CODE, 23)
    cut.set(unique.subarray(11, 15), 26)
    return cut
  }
  if (unique.length === VP8L_UNIQUE_LENGTH) {
    const cut = new Uint8Array(VP8L_CUT_LENGTH)
    cut.set([0x52, 0x49, 0x46, 0x46], 0)
    cut.set(unique.subarray(0, 4), 4)
    cut.set([0x57, 0x45, 0x42, 0x50], 8)
    cut.set(FOURCC_VP8L, 12)
    cut.set(unique.subarray(4, 8), 16)
    cut[20] = 0x2f
    cut.set(unique.subarray(8, 12), 21)
    return cut
  }
  throw new ParseError('<fragment>', `webp fragment must be ${VP8_UNIQUE_LENGTH} or ${VP8L_UNIQUE_LENGTH} bytes, got ${unique.length}`)
}
