import type { Plugin } from 'vite'

export interface HeaderlessOptions {
  /** Glob patterns, relative to publicDir, whose files get stripped. */
  include: string[]
  /** Glob patterns carved back out of `include`. */
  exclude?: string[]
  /** Virtual module id the fragment map is exposed under. */
  virtualId?: string
}

/**
 * Three hooks, no build-target branching:
 *
 *   buildStart   read the source files, detect format, cut the file-unique header,
 *                XOR-mask it, expose the map through a virtual module
 *   closeBundle  apply the same cut to the emitted files in outDir
 *   serve (dev)  expose an empty map, leave the sources untouched
 *
 * dev and build differ by DATA (an empty map), never by a code branch, so the
 * runtime loader executes an identical path everywhere.
 */
export default function headerless(_options: HeaderlessOptions): Plugin {
  return {
    name: 'vite-plugin-headerless',
    apply: 'build',
    buildStart() {
      throw new Error('vite-plugin-headerless: not implemented yet')
    }
  }
}
