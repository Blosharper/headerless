/**
 * Ambient types for the virtual module. Consumers add
 * `"types": ["vite-plugin-headerless/client"]` to their tsconfig, or a
 * `/// <reference types="vite-plugin-headerless/client" />` where needed.
 */
declare module 'virtual:headerless' {
  /** Base64-encoded, XOR-masked fragment plus its splice coordinates. */
  export interface SerializedFragment {
    format: 'png' | 'webp' | 'jpeg'
    start: number
    length: number
    data: string
  }

  /**
   * posix path relative to publicDir → fragment.
   * Empty during dev — the runtime loader must treat a missing key as
   * "serve the path untouched".
   */
  export const fragments: Record<string, SerializedFragment>

  /** XOR key the fragments were masked with. Empty during dev. */
  export const key: string
}
