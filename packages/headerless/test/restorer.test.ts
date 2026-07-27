import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetRestorer, strip } from '../src/index'
import type { SerializedFragment } from '../src/index'

const KEY = 'restorer-test-key'

/** Minimal structurally-valid lossy WebP (same fixture as core.test). */
function makeWebpVp8(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x12, 0x00, 0x00, 0x00,
    0x50, 0x11, 0x00, 0x9d, 0x01, 0x2a, 0x00, 0x05, 0x80, 0x02,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
  ])
}

function serialize(original: Uint8Array, mapKey: string) {
  const { fragment, body } = strip(original, mapKey, new TextEncoder().encode(KEY))
  const serialized: SerializedFragment = {
    format: fragment.format,
    start: fragment.start,
    length: fragment.length,
    data: Buffer.from(fragment.data).toString('base64')
  }
  return { serialized, body }
}

describe('AssetRestorer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns unmapped paths untouched (dev empty map is a pass-through)', async () => {
    const restorer = new AssetRestorer({ fragments: {}, key: '' })
    await expect(restorer.ensure('assets/story/a.webp')).resolves.toBe('assets/story/a.webp')
  })

  it('fetches the body, splices the fragment back, and hands out a Blob URL', async () => {
    const original = makeWebpVp8()
    const mapKey = 'assets/story/cg.webp'
    const { serialized, body } = serialize(original, mapKey)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(body.buffer)
    })
    vi.stubGlobal('fetch', fetchMock)
    const createObjectURL = vi.fn().mockReturnValue('blob:test-url')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL }))

    const restorer = new AssetRestorer({ fragments: { [mapKey]: serialized }, key: KEY })
    // Relative '../' prefixes (how SPAs address public assets) normalize to the map key.
    const url = await restorer.ensure(`../${mapKey}`)

    expect(url).toBe('blob:test-url')
    // The MAP KEY is fetched, never the caller's original path shape — see the
    // file:// regression test below for why.
    expect(fetchMock).toHaveBeenCalledWith(mapKey)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('image/webp')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(original)

    // Second request is a cache hit — no second fetch.
    await expect(restorer.ensure(mapKey)).resolves.toBe('blob:test-url')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("resolves the fetch URL against the document base, not the caller's path (packaged file:// regression)", async () => {
    // Packaged Electron: the document lives at <app.asar>/dist/index.html and
    // file:// has no root clamp, so fetching a caller-shaped '../assets/x'
    // would escape dist/ and 404 — silently tripping the raw-path fallback,
    // which now serves a STRIPPED body. The map key resolved against the
    // document base lands on the real dist copy in every environment.
    const original = makeWebpVp8()
    const mapKey = 'assets/story/pack.webp'
    const { serialized, body } = serialize(original, mapKey)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(body.buffer)
    })
    vi.stubGlobal('fetch', fetchMock)
    // Constructible stub — toFetchUrl calls `new URL(key, base)` before fetch.
    class StubURL extends URL {
      static createObjectURL = vi.fn().mockReturnValue('blob:packed')
    }
    vi.stubGlobal('URL', StubURL)
    vi.stubGlobal('document', {
      baseURI: 'file:///Applications/Game.app/Contents/Resources/app.asar/dist/index.html'
    })

    const restorer = new AssetRestorer({ fragments: { [mapKey]: serialized }, key: KEY })
    await expect(restorer.ensure(`../${mapKey}`)).resolves.toBe('blob:packed')
    expect(fetchMock).toHaveBeenCalledWith(
      `file:///Applications/Game.app/Contents/Resources/app.asar/dist/${mapKey}`
    )
  })

  it('never throws: a failed fetch warns and falls back to the raw path', async () => {
    const mapKey = 'assets/story/missing.webp'
    const serialized: SerializedFragment = { format: 'webp', start: 0, length: 30, data: 'AAAA' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const restorer = new AssetRestorer({ fragments: { [mapKey]: serialized }, key: KEY })
    await expect(restorer.ensure(`/${mapKey}`)).resolves.toBe(`/${mapKey}`)
    expect(warn).toHaveBeenCalled()
  })

  it('concurrent requests share one in-flight assembly', async () => {
    const original = makeWebpVp8()
    const mapKey = 'assets/story/racy.webp'
    const { serialized, body } = serialize(original, mapKey)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(body.buffer)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'URL',
      Object.assign(Object.create(URL), { createObjectURL: vi.fn().mockReturnValue('blob:one') })
    )

    const restorer = new AssetRestorer({ fragments: { [mapKey]: serialized }, key: KEY })
    const [a, b] = await Promise.all([restorer.ensure(mapKey), restorer.ensure(mapKey)])
    expect(a).toBe('blob:one')
    expect(b).toBe('blob:one')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('prefetch assembles every mapped path in the batch', async () => {
    const original = makeWebpVp8()
    const mapKey = 'assets/story/pre.webp'
    const { serialized, body } = serialize(original, mapKey)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(body.buffer)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'URL',
      Object.assign(Object.create(URL), { createObjectURL: vi.fn().mockReturnValue('blob:pre') })
    )

    const restorer = new AssetRestorer({ fragments: { [mapKey]: serialized }, key: KEY })
    await restorer.prefetch([`../${mapKey}`, 'assets/story/not-mapped.webp'])
    await expect(restorer.ensure(mapKey)).resolves.toBe('blob:pre')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
