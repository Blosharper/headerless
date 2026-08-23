import { restore } from './ops'
import type { Format, Fragment } from './types'

/** A fragment as the bundler adapter serializes it into the app bundle. */
export interface SerializedFragment {
  format: Format
  start: number
  length: number
  /** Base64 of the XOR-masked fragment bytes. */
  data: string
}

export interface RestorerInit {
  /** posix path (relative to the served asset root) → fragment. Empty in dev. */
  fragments: Record<string, SerializedFragment>
  /** XOR key the fragments were masked with. */
  key: string
}

const MIME: Record<Format, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpeg: 'image/jpeg'
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Runtime counterpart of the build-time strip: fetch the headerless body,
 * splice the fragment back in memory, hand out a Blob URL.
 *
 * Contract (mirrors the design doc):
 * - A path missing from the fragment map is returned untouched — callers never
 *   need to know whether a file is protected, and a dev server's empty map
 *   makes the whole class a pass-through.
 * - The body is always fetched from the normalized map key, never from the
 *   caller's path — see `bodyUrl`. Fetching '../…' verbatim escapes the app
 *   root and breaks every protected asset under a packaged `file://` origin.
 * - Nothing throws past this class: a failed fetch or splice logs a warning
 *   and falls back to the raw path. A broken image beats a hung app.
 * - Blob URLs are cached for the session; concurrent requests for the same
 *   path share one in-flight assembly.
 */
export class AssetRestorer {
  private readonly fragments: Record<string, SerializedFragment>
  private readonly keyBytes: Uint8Array
  private readonly cache = new Map<string, string>()
  private readonly pending = new Map<string, Promise<string>>()

  constructor(init: RestorerInit) {
    this.fragments = init.fragments
    this.keyBytes = new TextEncoder().encode(init.key)
  }

  /** '../assets/x' · '/assets/x' → 'assets/x' — the fragment map's key space. */
  private toMapKey(path: string): string {
    return path.replace(/^(?:\.\.\/)+|^\/+/, '')
  }

  /**
   * Where to fetch the headerless body from — derived from the **map key**, never from
   * the caller's path.
   *
   * '../assets/x.webp' is how an SPA addresses public assets from a nested route, but
   * fetching that verbatim resolves '..' against the document and walks out of the app
   * root. Under a packaged `file://` origin there is nothing above that root, so the
   * request fails and every protected asset silently degrades to its raw, unassembled
   * path — a broken image with no error anyone notices.
   *
   * ⚠️ This has now regressed twice (0.1.0, then again in 0.1.2). The map key is already
   * root-relative, so resolving it against the document base is the only form that holds
   * under both sub-path http(s) hosting and file://. The assertion in restorer.test.ts
   * pins it — do not relax it to the caller path.
   */
  private bodyUrl(mapKey: string): string {
    // A host without a document (SSR probe, worker) has no base to resolve against, and
    // there the bare key is already right: fetch() resolves relative URLs on its own.
    if (typeof document === 'undefined' || !document.baseURI) return mapKey
    return new URL(mapKey, document.baseURI).toString()
  }

  /** A displayable URL — a Blob URL for mapped paths, the input path otherwise. */
  public async ensure(path: string): Promise<string> {
    const mapKey = this.toMapKey(path)
    if (!this.fragments[mapKey]) return path

    const hit = this.cache.get(mapKey)
    if (hit) return hit

    let assembling = this.pending.get(mapKey)
    if (!assembling) {
      assembling = this.assemble(path, mapKey).finally(() => this.pending.delete(mapKey))
      this.pending.set(mapKey, assembling)
    }
    return assembling
  }

  /** Assemble a batch up front (e.g. every image of a cutscene sequence). */
  public async prefetch(paths: string[]): Promise<void> {
    await Promise.all(paths.map(p => this.ensure(p)))
  }

  private async assemble(originalPath: string, mapKey: string): Promise<string> {
    try {
      const serialized = this.fragments[mapKey]
      const response = await fetch(this.bodyUrl(mapKey))
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
      const body = new Uint8Array(await response.arrayBuffer())
      const fragment: Fragment = {
        format: serialized.format,
        start: serialized.start,
        length: serialized.length,
        data: base64ToBytes(serialized.data)
      }
      // restore() returns a fresh array, so the view spans its whole buffer
      // (which is what BlobPart requires).
      const bytes = restore(fragment, body, this.keyBytes)
      const url = URL.createObjectURL(
        new Blob([bytes.buffer as ArrayBuffer], { type: MIME[serialized.format] })
      )
      this.cache.set(mapKey, url)
      return url
    } catch (err) {
      console.warn(`[headerless] assembly failed for ${mapKey}, serving the raw path:`, err)
      return originalPath
    }
  }
}
