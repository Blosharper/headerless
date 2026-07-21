# vite-plugin-headerless

Vite adapter for [`headerless`](../headerless) — strips format-defining header fields from
binary assets during `vite build`, and exposes the fragments to the app through a virtual module.

**Not encryption, not DRM.** See the core package for what this does and does not protect.

> ⚠️ WIP — API is not stable and this package is not published yet.

## Hooks

| Hook | Work |
| --- | --- |
| `buildStart` | detect format, cut the file-unique header, XOR-mask it, expose the fragment map |
| `closeBundle` | apply the same cut to the emitted files in `outDir` |
| dev (`serve`) | expose an empty map; sources are left untouched |

dev and build differ by **data** (an empty map), never by a code branch — so the runtime
loader takes an identical path in every phase, and nothing can break only in a packaged build.

## License

MIT
