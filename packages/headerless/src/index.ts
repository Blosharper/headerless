import { detect } from './detect'
import { locateJpeg, rebuildJpeg } from './formats/jpeg'
import { locatePng, rebuildPng } from './formats/png'
import { locateWebp, rebuildWebp } from './formats/webp'
import { ParseError, UnsupportedFormatError } from './types'
import type { Format, Fragment, HeaderSpec } from './types'

export { detect }
export { ParseError, UnsupportedFormatError } from './types'
export type { Format, Fragment, HeaderSpec } from './types'

/**
 * Locate the file-unique header fields for a buffer.
 *
 * Per format (see the design doc):
 *   png   signature + IHDR chunk; the key is IHDR data + CRC
 *   webp  RIFF + chunk + frame header; the key is size fields + frame tag + dimensions
 *   jpeg  the SOFn segment — its position varies, so the markers are walked
 *
 * @throws UnsupportedFormatError when no parser matches
 * @throws ParseError when a known format has unexpected structure
 */
export function locate(buf: Uint8Array, path: string): HeaderSpec {
  const format = detect(buf)
  if (!format) throw new UnsupportedFormatError(path)
  switch (format) {
    case 'png':
      return locatePng(buf, path)
    case 'webp':
      return locateWebp(buf, path)
    case 'jpeg':
      return locateJpeg(buf, path)
  }
}

/** Repeating-key XOR — masks the fragment so it does not look like a header on sight. */
function xor(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length === 0) throw new Error('headerless: XOR key must not be empty')
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length]
  return out
}

/** Remove the located header and return the fragment plus the headerless body. */
export function strip(
  buf: Uint8Array,
  path: string,
  key: Uint8Array
): { fragment: Fragment; body: Uint8Array } {
  const spec = locate(buf, path)
  const uniqueTotal = spec.unique.reduce((n, r) => n + r.length, 0)
  const unique = new Uint8Array(uniqueTotal)
  let w = 0
  for (const r of spec.unique) {
    unique.set(buf.subarray(r.offset, r.offset + r.length), w)
    w += r.length
  }
  const body = new Uint8Array(buf.length - spec.cutLength)
  body.set(buf.subarray(0, spec.start), 0)
  body.set(buf.subarray(spec.start + spec.cutLength), spec.start)
  return {
    fragment: {
      format: spec.format,
      start: spec.start,
      length: spec.cutLength,
      data: xor(unique, key)
    },
    body
  }
}

function rebuildCut(format: Format, unique: Uint8Array): Uint8Array {
  switch (format) {
    case 'png':
      return rebuildPng(unique)
    case 'webp':
      return rebuildWebp(unique)
    case 'jpeg':
      return rebuildJpeg(unique)
  }
}

/** Reassemble the original bytes from a fragment and a headerless body. */
export function restore(fragment: Fragment, body: Uint8Array, key: Uint8Array): Uint8Array {
  const unique = xor(fragment.data, key)
  const cut = rebuildCut(fragment.format, unique)
  if (cut.length !== fragment.length) {
    throw new ParseError(
      '<fragment>',
      `rebuilt cut is ${cut.length} bytes but the fragment says ${fragment.length}`
    )
  }
  const out = new Uint8Array(body.length + cut.length)
  out.set(body.subarray(0, fragment.start), 0)
  out.set(cut, fragment.start)
  out.set(body.subarray(fragment.start), fragment.start + cut.length)
  return out
}
