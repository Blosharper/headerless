/** Formats with a parser. Anything else must fail the build — see design doc §3. */
export type Format = 'png' | 'webp' | 'jpeg'

/** A cut taken out of one file. */
export interface Fragment {
  /** Format the cut was made for — restore needs it to regenerate the constant runs. */
  format: Format
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
  /** Byte offset where the cut starts (0 except for JPEG, whose SOF position varies). */
  start: number
  /** Total bytes to remove from the file. */
  cutLength: number
  /** Byte ranges within the file that vary per file (the actual key). All lie inside the cut. */
  unique: Array<{ offset: number; length: number }>
}

export class UnsupportedFormatError extends Error {
  constructor(
    public readonly path: string,
    reason?: string
  ) {
    super(
      `headerless: ${reason ?? `no parser for "${path}"`}. ` +
        'Refusing to fall back to a fixed-length cut — that would strip only ' +
        'constant bytes and produce a fragment that is not a key.'
    )
    this.name = 'UnsupportedFormatError'
  }
}

/** A file matched a known format but its structure is not what the parser expects. */
export class ParseError extends Error {
  constructor(
    public readonly path: string,
    detail: string
  ) {
    super(`headerless: cannot parse "${path}": ${detail}`)
    this.name = 'ParseError'
  }
}
