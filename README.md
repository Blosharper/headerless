# headerless

Strips format-defining header fields from binary assets at build time, and puts them back
in memory at runtime.

**Not encryption, not DRM** — it raises the cost of extracting assets from a shipped app
from *unzip* to *reverse-engineer*. Anything the renderer can see, a determined attacker
can see too. That is by design, and the scope is stated up front so nobody mistakes this
for protection it does not provide.

> ⚠️ **0.x.** Implemented and dogfooding in a shipped commercial game; the API may still move before 0.1.0.
>
> **See it live**: `npm install && npm run demo`, then open <http://localhost:5180/demo/> — generate a sample
> image (or drop your own) and watch it flow through original → stripped (undecodable) → restored, byte-identical.

## Packages

| Package | Role |
| --- | --- |
| [`headerless`](packages/headerless) | Bundler-agnostic core — format detection, cut, restore |
| [`vite-plugin-headerless`](packages/vite-plugin-headerless) | Vite adapter |

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
  CRC**, the WebP frame header, JPEG `SOF0` (whose offset varies, so markers get walked).
- **Constants are removed but not stored.** They are regenerated on restore, which keeps
  fragments to 20–30 bytes per file.
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
- Whoever locates the fragments in a bundle can restore every asset.
- PNG in particular is *harder* to restore, not impossible: unpacking the IDAT stream
  constrains the dimension candidates. Removing the CRC takes away the cheapest way to
  confirm a guess.

## License

MIT
