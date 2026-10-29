# vite-plugin-headerless

Vite adapter for [`headerless`](https://github.com/Blosharper/headerless/tree/main/packages/headerless) — strips
format-defining header fields from binary assets during `vite build`, and exposes the
fragments to the app through a virtual module.

**Not encryption, not DRM.** See the
[repository README](https://github.com/Blosharper/headerless#readme) for what this does and
does not protect.

> **Status — 0.x, published.** Implemented and released. Until 1.0, a breaking change bumps
> the **minor** version, which the default `^0.x.y` range already excludes.

## Install

```sh
npm install vite-plugin-headerless
```

`headerless` (the core) is installed as a dependency. Vite 5 or later is a peer dependency.

## Configure

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
  ],
  // Required for `vite` (dev): the runtime entry imports a virtual module that
  // Vite's dependency pre-bundler cannot resolve.
  optimizeDeps: { exclude: ['vite-plugin-headerless'] }
})
```

| Option | Type | Description |
| --- | --- | --- |
| `include` | `string[]` | Glob patterns, relative to `publicDir`, whose files get stripped. Required. |
| `exclude` | `string[]` | Glob patterns carved back out of `include`. |
| `key` | `string` | XOR key that masks the fragments. Required, non-empty. It ships in the bundle next to the fragments — it hides the header shapes from a casual string dump, nothing more. |
| `virtualId` | `string` | Virtual module id the fragment map is exposed under. Default `'virtual:headerless'`. |

Only files under `publicDir` are processed. Assets imported from JavaScript modules go through
Vite's own asset pipeline and are left untouched.

## Load assets at runtime

A stripped file no longer decodes, so the app asks the pre-wired restorer for a displayable
URL instead of referencing the file directly:

```js
import { assetRestorer } from 'vite-plugin-headerless/runtime'

img.src = await assetRestorer.ensure('assets/cg.png')
```

`assetRestorer` is an `AssetRestorer` from `headerless`, constructed with the injected
fragment map: `ensure(path)` returns a Blob URL, `prefetch(paths)` assembles a batch up
front, and `release(path)` revokes a URL and evicts it from the cache. A path outside the map
is returned unchanged.

The `/runtime` entry reads the default virtual id. With a custom `virtualId`, build the
restorer from that module yourself:

```js
import { AssetRestorer } from 'headerless'
import { fragments, key } from 'virtual:my-fragments'

export const assetRestorer = new AssetRestorer({ fragments, key })
```

For TypeScript, add `"types": ["vite-plugin-headerless/client"]` to `tsconfig.json` (or a
`/// <reference types="vite-plugin-headerless/client" />`) to type `virtual:headerless`.

## Hooks

| Hook | Work |
| --- | --- |
| `buildStart` | detect format, cut the file-unique header, XOR-mask it, expose the fragment map |
| `generateBundle` | fail the build if a stripped file is referenced from emitted CSS |
| `closeBundle` | overwrite the copies already emitted to `outDir` with the stripped bodies |
| dev (`serve`) | expose an empty map; sources are left untouched |

dev and build differ by **data** (an empty map), never by a code branch — so the runtime
loader takes an identical path in every phase, and nothing can break only in a packaged build.

The build fails, rather than shipping a broken asset, when a matched file is in an unsupported
format (anything but PNG, JPEG, and simple lossy or lossless WebP) or is referenced from CSS,
whose `url()` cannot go through the restorer.

## License

MIT
