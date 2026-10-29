# headerless

Strips format-defining header fields from binary assets at build time, and puts them back
in memory at runtime.

**Not encryption, not DRM** — it raises the cost of extracting assets from a shipped app
from *unzip* to *reverse-engineer*. Anything the renderer can see, a determined attacker
can see too. That is by design, and the scope is stated up front so nobody mistakes this
for protection it does not provide.

> **Status — 0.x, published on npm.** Both packages below are implemented and released to
> the npm registry, and dogfooded in a shipped commercial game. Until 1.0, a breaking change bumps the **minor**
> version, which the default `^0.x.y` range already excludes.
>
> **See it live**: `npm install && npm run demo`, then open <http://localhost:5180/demo/> — generate a sample
> image (or drop your own) and watch it flow through original → stripped (undecodable) → restored, byte-identical.

## Packages

| Package | Role |
| --- | --- |
| [`headerless`](packages/headerless) | Bundler-agnostic core — format detection, cut, restore, runtime loader |
| [`vite-plugin-headerless`](packages/vite-plugin-headerless) | Vite adapter — strips at build time, injects the fragments, ships a pre-wired loader |

## Quick start (Vite)

**1. Install.**

```sh
npm install vite-plugin-headerless
```

The plugin depends on `headerless`, so the core comes with it. Vite 5 or later is a peer
dependency.

**2. Configure.** Files are matched by glob, relative to Vite's `publicDir` (`public/` by default).

```js
// vite.config.js
import { defineConfig } from 'vite'
import headerless from 'vite-plugin-headerless'

export default defineConfig({
  plugins: [
    headerless({
      include: ['assets/**/*.{png,jpg,jpeg,webp}'],
      key: 'replace-with-your-own-key'
    })
  ]
})
```

**3. Load assets through the restorer.** A protected file in the build output no longer
decodes, so it must not be referenced directly — ask the restorer for a displayable URL.

```js
import { assetRestorer } from 'vite-plugin-headerless/runtime'

img.src = await assetRestorer.ensure('assets/cg.png')
```

`ensure()` fetches the stripped body, splices the fragment back in memory, and returns a Blob
URL; call `release(path)` when the asset is no longer needed. During `vite` (dev) the
fragment map is empty and `ensure()` returns the path unchanged, so the same code runs in
every phase.

What fails the build rather than shipping a broken asset: a matched file in an unsupported
format, and a matched file referenced from CSS (CSS `url()` cannot go through the restorer).
Options, hooks, and TypeScript setup are in the
[plugin README](packages/vite-plugin-headerless); the core API, for other bundlers or a custom
pipeline, is in the [core README](packages/headerless).

## Supported formats

| Format | Cut | Notes |
| --- | --- | --- |
| PNG | signature + `IHDR` chunk (data and CRC) | |
| JPEG | the `SOFn` frame header, located by walking the markers | any `SOFn`, baseline and progressive included |
| WebP | RIFF header + `VP8 ` / `VP8L` frame header | simple lossy and lossless only |

Anything else — GIF, AVIF, extended WebP (`VP8X`: animation, alpha on lossy images, embedded
metadata) — fails the build with `UnsupportedFormatError`. Keep such files out of `include`.

## The idea

A viewer cannot decode an image without its header. Remove the header and the compressed
data is just bytes — nothing says how wide a scanline is, or how to interpret a sample.
So the header is taken out at build time and handed back only at runtime, in memory.

The rule that makes this worth doing:

> **The removed bytes must be the key that reconstitutes the file.**

That single constraint decides the rest of the design:

- **No fixed-length cuts.** A PNG signature and a JPEG `SOI`/`APP0` are identical in every
  file. Cutting them accomplishes nothing — a restorer writes the constant back. Making the
  cut *longer* makes it worse, since the constant share of the fragment grows.
- **Cuts are per format**, targeting fields that vary per file: PNG `IHDR` data **and its
  CRC**, the WebP frame header, the JPEG `SOFn` frame header (whose offset varies, so
  markers get walked).
- **Constants are removed but not stored.** They are regenerated on restore, which keeps
  a fragment to 10–20 bytes per file.
- **The CRC goes too.** Left in place, it hands a brute-force restorer an oracle for
  verifying guessed dimensions.
- **Unknown formats fail the build.** Falling back to a fixed cut would silently produce
  files that are stripped but not protected.

## Why this can be open source

Because the fragment is a *per-file key* rather than a shared constant, publishing the
algorithm does not weaken it — Kerckhoffs's principle. Knowing exactly how the cut works
gets an attacker nowhere without that specific app's fragments. Only the fragments are
secret.

Had the design cut constant bytes instead, publishing it would have produced a universal
unpacker on day one.

## Honest limits

- Assembly happens in client memory. DevTools and memory dumps still see everything.
- Whoever locates the fragments in a bundle can restore every asset. The XOR key that masks
  them ships in the same bundle — it keeps the header shapes out of a casual string dump,
  nothing more.
- PNG in particular is *harder* to restore, not impossible: unpacking the IDAT stream
  constrains the dimension candidates. Removing the CRC takes away the cheapest way to
  confirm a guess.

## License

MIT
