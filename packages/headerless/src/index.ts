import { detect } from './detect'
import { UnsupportedFormatError } from './types'
import type { Fragment, HeaderSpec } from './types'

export { detect }
export { UnsupportedFormatError } from './types'
export type { Format, Fragment, HeaderSpec } from './types'

/**
 * Locate the file-unique header fields for a buffer.
 *
 * Per format (see the design doc):
 *   png   signature + IHDR chunk; the key is IHDR data + CRC
 *   webp  RIFF + chunk + frame header; the key is the frame header size fields
 *   jpeg  SOI through the end of SOF0 — position varies, so the markers must be walked
 *
 * @throws UnsupportedFormatError when no parser matches
 */
export function locate(_buf: Uint8Array, path: string): HeaderSpec {
  const format = detect(_buf)
  if (!format) throw new UnsupportedFormatError(path)
  throw new Error('headerless: locate() not implemented yet')
}

/** Remove the located header and return the fragment plus the headerless body. */
export function strip(
  _buf: Uint8Array,
  _path: string,
  _key: Uint8Array
): { fragment: Fragment; body: Uint8Array } {
  throw new Error('headerless: strip() not implemented yet')
}

/** Reassemble the original bytes from a fragment and a headerless body. */
export function restore(
  _fragment: Fragment,
  _body: Uint8Array,
  _key: Uint8Array
): Uint8Array {
  throw new Error('headerless: restore() not implemented yet')
}
