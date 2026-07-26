import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { strip } from 'headerless'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import headerless from '../src/index'

const KEY = 'integration-test-key'

/** Minimal structurally-valid lossy WebP. */
function makeWebpVp8(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x12, 0x00, 0x00, 0x00,
    0x50, 0x11, 0x00, 0x9d, 0x01, 0x2a, 0x00, 0x05, 0x80, 0x02,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
  ])
}

interface ScaffoldOptions {
  css?: string
  extraAsset?: { rel: string; bytes: Uint8Array }
}

/** A tiny vite project: one public CG + an entry importing the virtual module. */
async function scaffold(opts: ScaffoldOptions = {}) {
  // macOS tmpdir is a symlink (/var → /private/var); vite canonicalizes the
  // root, so hand it the real path or emitted file names break.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'headerless-plugin-')))
  await mkdir(path.join(root, 'public/assets/story'), { recursive: true })
  const original = makeWebpVp8()
  await writeFile(path.join(root, 'public/assets/story/cg.webp'), original)
  if (opts.extraAsset) {
    const abs = path.join(root, 'public', opts.extraAsset.rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, opts.extraAsset.bytes)
  }
  const cssImport = opts.css ? "import './style.css'\n" : ''
  if (opts.css) await writeFile(path.join(root, 'style.css'), opts.css)
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><script type="module" src="/main.js"></script>'
  )
  await writeFile(
    path.join(root, 'main.js'),
    cssImport +
      "import { fragments, key } from 'virtual:headerless'\n" +
      'document.title = key + Object.keys(fragments).length\n'
  )
  return { root, original }
}

function plugin(include = ['assets/story/**']) {
  return headerless({ include, key: KEY })
}

async function bundleJs(root: string): Promise<string> {
  const assetDir = path.join(root, 'dist/assets')
  const names = await readdir(assetDir)
  const js = names.filter((n) => n.endsWith('.js'))
  let out = ''
  for (const n of js) out += await readFile(path.join(assetDir, n), 'utf8')
  return out
}

describe('vite build integration', () => {
  it('strips matched public assets in dist and embeds their fragments in the bundle', async () => {
    const { root, original } = await scaffold()
    await build({ root, logLevel: 'silent', plugins: [plugin()] })

    const dist = new Uint8Array(await readFile(path.join(root, 'dist/assets/story/cg.webp')))
    expect(dist.length).toBe(original.length - 30)
    expect(dist[0]).not.toBe(0x52) // no "RIFF" any more

    const js = await bundleJs(root)
    expect(js).toContain('assets/story/cg.webp')
    // The exact masked fragment must be in the bundle, base64-encoded.
    const expected = strip(original, 'assets/story/cg.webp', new TextEncoder().encode(KEY))
    expect(js).toContain(Buffer.from(expected.fragment.data).toString('base64'))
    expect(js).toContain(KEY)
  })

  it('leaves non-matched public assets intact', async () => {
    const bytes = makeWebpVp8()
    const { root } = await scaffold({ extraAsset: { rel: 'assets/other/bg.webp', bytes } })
    await build({ root, logLevel: 'silent', plugins: [plugin()] })
    const untouched = new Uint8Array(await readFile(path.join(root, 'dist/assets/other/bg.webp')))
    expect(untouched).toEqual(bytes)
  })

  it('fails the build on a matched file with no parser', async () => {
    const { root } = await scaffold({
      extraAsset: { rel: 'assets/story/junk.webp', bytes: new Uint8Array([0, 1, 2, 3, 4, 5]) }
    })
    await expect(build({ root, logLevel: 'silent', plugins: [plugin()] })).rejects.toThrow(
      /no parser/
    )
  })

  it('fails the build when CSS references a matched asset by url()', async () => {
    const { root } = await scaffold({
      css: '.bg { background: url(/assets/story/cg.webp); }'
    })
    await expect(build({ root, logLevel: 'silent', plugins: [plugin()] })).rejects.toThrow(
      /referenced from CSS/
    )
  })
})

describe('dev server (serve mode)', () => {
  it('serves an empty fragment map through the virtual module', async () => {
    const { createServer } = await import('vite')
    const { root } = await scaffold()
    const server = await createServer({
      root,
      logLevel: 'silent',
      plugins: [plugin()],
      server: { middlewareMode: true }
    })
    try {
      const mod = await server.transformRequest('virtual:headerless')
      expect(mod?.code).toContain('fragments = {}')
      expect(mod?.code).not.toContain(KEY)
      // and the source file on disk stays untouched
      const src = new Uint8Array(
        await readFile(path.join(root, 'public/assets/story/cg.webp'))
      )
      expect(src[0]).toBe(0x52)
    } finally {
      await server.close()
    }
  })
})
