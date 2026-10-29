import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { strip } from 'headerless'
import type { Fragment } from 'headerless'
import { glob } from 'tinyglobby'
import type { Plugin, ResolvedConfig } from 'vite'

export interface HeaderlessOptions {
  /** Glob patterns, relative to publicDir, whose files get stripped. */
  include: string[]
  /** Glob patterns carved back out of `include`. */
  exclude?: string[]
  /**
   * XOR key for masking the fragments. Ends up in the bundle alongside the
   * fragments — it hides the header shapes from a casual string dump, nothing
   * more. Keep it out of public repos anyway.
   */
  key: string
  /** Virtual module id the fragment map is exposed under. */
  virtualId?: string
}

interface StrippedEntry {
  fragment: Fragment
  body: Uint8Array
}

/** This package's own name, as it appears in a consumer's bare imports. */
const PACKAGE_NAME = 'vite-plugin-headerless'

/**
 * Three hooks, no build-target branching:
 *
 *   buildStart   read the source files, detect format, cut the file-unique header,
 *                XOR-mask it, expose the map through a virtual module
 *   closeBundle  write the headerless bodies over the copies in outDir
 *   serve (dev)  expose an empty map, leave the sources untouched
 *
 * dev and build differ by DATA (an empty map), never by a code branch, so the
 * runtime loader executes an identical path everywhere. The `config` hook only
 * keeps this package out of dependency pre-bundling, so that the `/runtime`
 * entry's virtual import resolves in dev without any consumer configuration.
 */
export default function headerless(options: HeaderlessOptions): Plugin {
  const virtualId = options.virtualId ?? 'virtual:headerless'
  const resolvedVirtualId = '\0' + virtualId
  const keyBytes = new TextEncoder().encode(options.key)
  /** posix-relative path (the runtime lookup key) → stripped file. */
  const entries = new Map<string, StrippedEntry>()
  let config: ResolvedConfig
  let buildFailed = false

  return {
    name: 'vite-plugin-headerless',

    config(userConfig) {
      // The `/runtime` entry imports `virtual:headerless`, which only this
      // plugin can resolve. Vite's dependency pre-bundler runs esbuild without
      // user plugins, so a pre-bundled copy of this package fails to resolve
      // that import and the dev server exits. Excluding the package (subpath
      // entries included) leaves `/runtime` to the regular plugin pipeline.
      // Vite concatenates arrays when it merges a returned partial config, so
      // a user-supplied exclude list is extended, never replaced.
      if (userConfig.optimizeDeps?.exclude?.includes(PACKAGE_NAME)) return
      return { optimizeDeps: { exclude: [PACKAGE_NAME] } }
    },

    configResolved(resolved) {
      config = resolved
    },

    async buildStart() {
      if (config.command !== 'build') return
      entries.clear()
      buildFailed = false
      if (!config.publicDir) return
      const files = await glob(options.include, {
        cwd: config.publicDir,
        ignore: options.exclude
      })
      // An unknown format throws UnsupportedFormatError here and fails the
      // build — a fixed-length fallback would silently produce files that are
      // stripped but not protected.
      for (const rel of files.sort()) {
        const buf = new Uint8Array(await readFile(path.join(config.publicDir, rel)))
        const posixRel = rel.split(path.sep).join('/')
        const { fragment, body } = strip(buf, posixRel, keyBytes)
        entries.set(posixRel, { fragment, body })
      }
      const stored = [...entries.values()].reduce((n, e) => n + e.fragment.data.length, 0)
      config.logger.info(
        `[headerless] ${entries.size} asset(s) matched, ${stored}B of fragments in the bundle`
      )
    },

    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId
    },

    load(id) {
      if (id !== resolvedVirtualId) return
      if (config.command !== 'build') {
        // dev: empty map — the runtime loader passes every path through untouched
        return "export const fragments = {};\nexport const key = '';\n"
      }
      const serialized: Record<
        string,
        { format: string; start: number; length: number; data: string }
      > = {}
      for (const [rel, { fragment }] of entries) {
        serialized[rel] = {
          format: fragment.format,
          start: fragment.start,
          length: fragment.length,
          data: Buffer.from(fragment.data).toString('base64')
        }
      }
      return (
        `export const fragments = ${JSON.stringify(serialized)};\n` +
        `export const key = ${JSON.stringify(options.key)};\n`
      )
    },

    generateBundle(_, bundle) {
      if (!entries.size) return
      // Guard: a stripped path referenced from static CSS never goes through the
      // runtime loader — the symptom would be a silently broken image long after
      // the build. Fail the build instead. Matching is by basename so relative
      // url() forms are caught too.
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' || !fileName.endsWith('.css')) continue
        const source =
          typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString()
        for (const rel of entries.keys()) {
          const base = path.posix.basename(rel)
          if (source.includes(base)) {
            this.error(
              `[headerless] "${rel}" is referenced from CSS ("${fileName}"), which cannot go ` +
                'through the runtime loader and would render as a broken image. Either exclude ' +
                'it from the headerless range or move the reference into JS.'
            )
          }
        }
      }
    },

    buildEnd(error) {
      // closeBundle still runs after a failed build — writing (or ENOENT-ing on
      // a missing outDir) there would mask the real error.
      if (error) buildFailed = true
    },

    async closeBundle() {
      if (config.command !== 'build' || buildFailed || !entries.size) return
      const outDir = path.resolve(config.root, config.build.outDir)
      // copyPublicDir has already placed the intact copies; overwrite them with
      // the headerless bodies computed from the same sources at buildStart.
      // Strictly overwrite, never create: another closeBundle step may have
      // deliberately deleted a matched file from outDir (demo shakers and the
      // like) and recreating it here would resurrect a shipped asset.
      for (const [rel, { body }] of entries) {
        const target = path.join(outDir, rel)
        const exists = await access(target).then(
          () => true,
          () => false
        )
        if (exists) await writeFile(target, body)
      }
    }
  }
}
