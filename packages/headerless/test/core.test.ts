import { describe, expect, it } from 'vitest'
import { locate, restore, strip, ParseError, UnsupportedFormatError } from '../src/index'

const KEY = new Uint8Array([0xa5, 0x3c, 0x7e, 0x19])

// --- fixtures ------------------------------------------------------------

/** Minimal structurally-valid PNG: signature + IHDR + fake body. */
function makePng(): Uint8Array {
  const ihdrData = [0x00, 0x00, 0x01, 0x40, 0x00, 0x00, 0x00, 0xa0, 0x08, 0x06, 0x00, 0x00, 0x00]
  const crc = [0xde, 0xad, 0xbe, 0xef]
  const body = [0x00, 0x00, 0x00, 0x08, 0x49, 0x44, 0x41, 0x54, 0x11, 0x22, 0x33, 0x44]
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ...ihdrData, ...crc, ...body
  ])
}

function makeWebpVp8(): Uint8Array {
  const body = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x1a, 0x00, 0x00, 0x00, // riff size
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20, // "VP8 "
    0x12, 0x00, 0x00, 0x00, // chunk size
    0x50, 0x11, 0x00, // frame tag (varies per file)
    0x9d, 0x01, 0x2a, // start code (constant)
    0x00, 0x05, 0x80, 0x02, // width 1280, height 640
    ...body
  ])
}

function makeWebpVp8l(): Uint8Array {
  const body = [0x0a, 0x0b, 0x0c, 0x0d]
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x11, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x4c, // "VP8L"
    0x09, 0x00, 0x00, 0x00,
    0x2f, // signature (constant)
    0x3f, 0x90, 0x01, 0x4f, // packed dims/flags
    ...body
  ])
}

function makeWebpVp8x(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x20, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, // "VP8X"
    0x0a, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0x04, 0x00, 0x7f, 0x02, 0x00
  ])
}

/** SOI + APP0 + DQT + SOF0 + SOS-ish tail, all with correct segment lengths. */
function makeJpeg(): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const dqt = [0xff, 0xdb, 0x00, 0x06, 0x00, 0x10, 0x20, 0x30]
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x80, 0x05, 0x00, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  const tail = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xab, 0xcd]
  return new Uint8Array([0xff, 0xd8, ...app0, ...dqt, ...sof0, ...tail])
}

// --- locate --------------------------------------------------------------

describe('locate', () => {
  it('png: cuts signature + IHDR, keys data + CRC', () => {
    const spec = locate(makePng(), 'a.png')
    expect(spec).toEqual({
      format: 'png',
      start: 0,
      cutLength: 33,
      unique: [{ offset: 16, length: 17 }]
    })
  })

  it('webp vp8: cuts through the frame header, keys sizes + tag + dims', () => {
    const spec = locate(makeWebpVp8(), 'a.webp')
    expect(spec.format).toBe('webp')
    expect(spec.cutLength).toBe(30)
    expect(spec.unique.reduce((n, r) => n + r.length, 0)).toBe(15)
  })

  it('webp vp8l: cuts through the packed dims, keys sizes + dims', () => {
    const spec = locate(makeWebpVp8l(), 'a.webp')
    expect(spec.cutLength).toBe(25)
    expect(spec.unique.reduce((n, r) => n + r.length, 0)).toBe(12)
  })

  it('webp vp8x: refuses — inner frame header would remain restorable', () => {
    expect(() => locate(makeWebpVp8x(), 'a.webp')).toThrow(UnsupportedFormatError)
  })

  it('jpeg: walks markers to the SOF segment wherever it sits', () => {
    const buf = makeJpeg()
    const spec = locate(buf, 'a.jpg')
    expect(spec.format).toBe('jpeg')
    expect(buf[spec.start]).toBe(0xff)
    expect(buf[spec.start + 1]).toBe(0xc0)
    expect(spec.cutLength).toBe(2 + 0x11)
  })

  it('jpeg: fails when no SOF appears before start of scan', () => {
    const noSof = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 0xab])
    expect(() => locate(noSof, 'a.jpg')).toThrow(ParseError)
  })

  it('unknown bytes: refuses instead of falling back to a fixed cut', () => {
    expect(() => locate(new Uint8Array([0x00, 0x01, 0x02, 0x03]), 'a.bin')).toThrow(UnsupportedFormatError)
  })

  it('truncated png: fails parsing', () => {
    expect(() => locate(makePng().subarray(0, 20), 'a.png')).toThrow(ParseError)
  })
})

// --- strip / restore -----------------------------------------------------

describe('strip/restore roundtrip', () => {
  const cases: Array<[string, () => Uint8Array]> = [
    ['png', makePng],
    ['webp vp8', makeWebpVp8],
    ['webp vp8l', makeWebpVp8l],
    ['jpeg', makeJpeg]
  ]

  for (const [name, make] of cases) {
    it(`${name}: restore(strip(x)) === x`, () => {
      const original = make()
      const { fragment, body } = strip(original, `a.${name}`, KEY)
      expect(body.length).toBe(original.length - fragment.length)
      const rebuilt = restore(fragment, body, KEY)
      expect(rebuilt).toEqual(original)
    })
  }

  it('the stripped body no longer carries the format signature', () => {
    const { body } = strip(makeWebpVp8(), 'a.webp', KEY)
    expect(String.fromCharCode(body[0], body[1], body[2], body[3])).not.toBe('RIFF')
    const png = strip(makePng(), 'a.png', KEY)
    expect(png.body[0]).not.toBe(0x89)
  })

  it('fragments are stored XOR-masked, not as raw header bytes', () => {
    const original = makePng()
    const { fragment } = strip(original, 'a.png', KEY)
    expect(fragment.data).not.toEqual(original.subarray(16, 33))
    expect(fragment.data.length).toBe(17)
  })

  it('a wrong key restores garbage, silently', () => {
    const original = makeWebpVp8()
    const { fragment, body } = strip(original, 'a.webp', KEY)
    const wrong = restore(fragment, body, new Uint8Array([0x00, 0x01]))
    expect(wrong.length).toBe(original.length)
    expect(wrong).not.toEqual(original)
  })

  it('an empty key is rejected', () => {
    expect(() => strip(makePng(), 'a.png', new Uint8Array())).toThrow(/key/)
  })

  it('jpeg: the cut is spliced back at its original mid-file offset', () => {
    const original = makeJpeg()
    const { fragment, body } = strip(original, 'a.jpg', KEY)
    expect(fragment.start).toBeGreaterThan(2)
    // The bytes before the cut are untouched in the body.
    expect(body.subarray(0, fragment.start)).toEqual(original.subarray(0, fragment.start))
    expect(restore(fragment, body, KEY)).toEqual(original)
  })
})
