import { ParseError } from '../types'
import type { HeaderSpec } from '../types'

export const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// IHDR is always the first chunk, always 13 bytes of data:
//   [signature 8][length 4 = 0x0000000D][type 4 = "IHDR"][data 13][CRC 4]
// The key is data + CRC (17 bytes). Signature, length, and type are constants
// and are regenerated on restore. The CRC MUST go with the data: left behind,
// it is an oracle for brute-forcing the dimensions.
const IHDR_PRELUDE = [0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]
export const PNG_CUT_LENGTH = 33
export const PNG_UNIQUE_LENGTH = 17

export function locatePng(buf: Uint8Array, path: string): HeaderSpec {
  if (buf.length < PNG_CUT_LENGTH) throw new ParseError(path, 'file shorter than signature + IHDR')
  for (let i = 0; i < IHDR_PRELUDE.length; i++) {
    if (buf[8 + i] !== IHDR_PRELUDE[i]) {
      throw new ParseError(path, 'first chunk is not a 13-byte IHDR')
    }
  }
  return {
    format: 'png',
    start: 0,
    cutLength: PNG_CUT_LENGTH,
    unique: [{ offset: 16, length: PNG_UNIQUE_LENGTH }]
  }
}

/** Rebuild the 33 cut bytes from the 17 stored ones. */
export function rebuildPng(unique: Uint8Array): Uint8Array {
  if (unique.length !== PNG_UNIQUE_LENGTH) {
    throw new ParseError('<fragment>', `png fragment must be ${PNG_UNIQUE_LENGTH} bytes, got ${unique.length}`)
  }
  const cut = new Uint8Array(PNG_CUT_LENGTH)
  cut.set(PNG_SIG, 0)
  cut.set(IHDR_PRELUDE, 8)
  cut.set(unique, 16)
  return cut
}
