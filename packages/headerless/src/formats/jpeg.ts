import { ParseError } from '../types'
import type { HeaderSpec } from '../types'

// The cut is the SOFn segment alone, located by walking the markers (its offset
// varies per file — a fixed-length cut would strip only the constant SOI/APP0
// and leave the dimensions behind, see design doc §2-A "알려진 약점").
//
// Cutting from SOI up to SOF was considered and rejected: that range contains
// quantization tables, which vary per file and would all have to be stored,
// bloating the fragment without adding key strength. The SOF body (precision,
// height, width, per-component sampling) is exactly what a decoder cannot
// guess — cut that, store that.
//
// Stored: marker id byte (C0/C2/… varies) + segment body.
// Regenerated: the 0xFF prefix and the 2-byte length (body length + 2).

// SOF0–SOF15 minus DHT (C4), DAC (CC) and RST/other non-frame markers.
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
])

export function locateJpeg(buf: Uint8Array, path: string): HeaderSpec {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new ParseError(path, 'missing SOI marker')
  }
  let pos = 2
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) throw new ParseError(path, `expected marker at offset ${pos}`)
    // Fill bytes: any number of 0xFF may pad before a marker id.
    while (buf[pos + 1] === 0xff) pos++
    const marker = buf[pos + 1]
    if (marker === 0xd9 || marker === 0xda) {
      // EOI or SOS — scan ended without a frame header.
      throw new ParseError(path, 'no SOF marker before start of scan')
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      // Standalone markers carry no length.
      pos += 2
      continue
    }
    const segLength = (buf[pos + 2] << 8) | buf[pos + 3]
    if (segLength < 2 || pos + 2 + segLength > buf.length) {
      throw new ParseError(path, `bad segment length at offset ${pos}`)
    }
    if (SOF_MARKERS.has(marker)) {
      return {
        format: 'jpeg',
        start: pos,
        cutLength: 2 + segLength,
        unique: [
          { offset: pos + 1, length: 1 }, // marker id — baseline vs progressive varies
          { offset: pos + 4, length: segLength - 2 } // segment body
        ]
      }
    }
    pos += 2 + segLength
  }
  throw new ParseError(path, 'ran out of bytes while walking markers')
}

/** Rebuild the cut segment: 0xFF + stored marker id + regenerated length + stored body. */
export function rebuildJpeg(unique: Uint8Array): Uint8Array {
  if (unique.length < 2) {
    throw new ParseError('<fragment>', `jpeg fragment too short: ${unique.length} bytes`)
  }
  const bodyLength = unique.length - 1
  const segLength = bodyLength + 2
  const cut = new Uint8Array(unique.length + 3)
  cut[0] = 0xff
  cut[1] = unique[0]
  cut[2] = (segLength >> 8) & 0xff
  cut[3] = segLength & 0xff
  cut.set(unique.subarray(1), 4)
  return cut
}
