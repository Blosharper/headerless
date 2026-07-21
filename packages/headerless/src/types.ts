/** Formats with a parser. Anything else must fail the build — see design doc §3. */
export type Format = 'png' | 'webp' | 'jpeg'

/** A cut taken out of one file. */
export interface Fragment {
  /** Byte offset where the cut starts. */
  start: number
  /** Number of bytes removed from the file. */
  length: number
  /**
   * The file-unique bytes, XOR-masked.
   * Constant runs (signatures, chunk names) are NOT stored here — they are
   * regenerated on restore, which keeps the fragment small and its key purity high.
   */
  data: Uint8Array
}

/** Where a format's file-unique header fields live. */
export interface HeaderSpec {
  format: Format
  /** Total bytes to remove from the file. */
  cutLength: number
  /** Byte ranges within the cut that vary per file (the actual key). */
  unique: Array<{ offset: number; length: number }>
}

export class UnsupportedFormatError extends Error {
  constructor(public readonly path: string) {
    super(
      `headerless: no parser for "${path}". ` +
        'Refusing to fall back to a fixed-length cut — that would strip only ' +
        'constant bytes and produce a fragment that is not a key.'
    )
    this.name = 'UnsupportedFormatError'
  }
}
