# headerless

Strips format-defining header fields from binary assets at build time, and puts them back in memory at runtime.

**Not encryption, not DRM** — it raises the cost of extracting assets from a shipped app
from *unzip* to *reverse-engineer*. Anything visible to the renderer stays visible to a
determined attacker; that is by design.

> **Status — 0.x, published.** The full API below is implemented. Until 1.0, a breaking
> change bumps the **minor** version, which the default `^0.x.y` range already excludes.

This is the bundler-agnostic core. With Vite, use
[`vite-plugin-headerless`](https://github.com/Blosharper/headerless/tree/main/packages/vite-plugin-headerless) instead — it
runs the strip during `vite build` and ships a pre-wired runtime loader; see the
[quick start](https://github.com/Blosharper/headerless#quick-start-vite).

## Install

```sh
npm install headerless
```

## Usage

Strip at build time (any JavaScript runtime with `Uint8Array`), restore at runtime:

```js
import { readFile } from 'node:fs/promises'
import { detect, strip, restore } from 'headerless'

const key = new TextEncoder().encode('replace-with-your-own-key')
const original = new Uint8Array(await readFile('public/assets/cg.png'))

detect(original) // 'png'
const { fragment, body } = strip(original, 'assets/cg.png', key)
// Ship `body` in place of the file; deliver `fragment` to the app some other way.

const restored = restore(fragment, body, key) // byte-identical to `original`
```

In the browser, `AssetRestorer` does the runtime half: it fetches the stripped body, splices
the fragment back in memory, and hands out a Blob URL.

```js
import { AssetRestorer } from 'headerless'

const restorer = new AssetRestorer({ fragments, key: 'replace-with-your-own-key' })
img.src = await restorer.ensure('assets/cg.png')
```

`fragments` maps an asset path (relative to the served root) to a serialized fragment —
`{ format, start, length, data }` with `data` as base64 of the masked bytes.

## API

| Export | Purpose |
| --- | --- |
| `detect(buf)` | Identify the format by magic bytes: `'png' \| 'jpeg' \| 'webp'`, or `null` |
| `locate(buf, path)` | Where the file-unique header fields live (`HeaderSpec`) |
| `strip(buf, path, key)` | Cut the header; returns `{ fragment, body }`, with the fragment XOR-masked by `key` |
| `restore(fragment, body, key)` | Reassemble the original bytes |
| `AssetRestorer` | Runtime loader — `ensure(path)`, `prefetch(paths)`, `release(path)` |
| `UnsupportedFormatError` | Thrown for a format without a parser — never falls back to a fixed cut |
| `ParseError` | Thrown when a known format has an unexpected structure |

`AssetRestorer` never throws past itself. A path missing from the fragment map is returned
unchanged (so an empty map makes it a pass-through), and a failed fetch or splice logs a
warning and falls back to the raw path. Blob URLs are cached until `release(path)` revokes
them.

## How it works

The cut fragment must be the **key** that reconstitutes the file. That single rule drives
everything else:

- A fixed-length cut is rejected. PNG signatures and JPEG `SOI`/`APP0` are identical across
  files, so a restorer just writes the constant back.
- Cuts are per format and target the fields that vary per file: PNG `IHDR` data **and CRC**,
  the WebP frame header (`VP8 ` and `VP8L`), the JPEG `SOFn` frame header.
- Constant runs are removed from the file but not stored in the fragment — they are
  regenerated on restore.
- Formats without a parser — including extended WebP (`VP8X`) — fail loudly instead of
  falling back to a fixed cut.

Because the fragment is a per-file key rather than a shared constant, publishing the
algorithm does not weaken it (Kerckhoffs). Only the fragments are secret.

The design rationale and its limits are documented in the
[repository README](https://github.com/Blosharper/headerless#readme).

## License

MIT
