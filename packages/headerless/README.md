# headerless

Strips format-defining header fields from binary assets at build time, and puts them back in memory at runtime.

**Not encryption, not DRM** — it raises the cost of extracting assets from a shipped app
from *unzip* to *reverse-engineer*. Anything visible to the renderer stays visible to a
determined attacker; that is by design.

> ⚠️ WIP — API is not stable and this package is not published yet.

## How it works

The cut fragment must be the **key** that reconstitutes the file. That single rule drives
everything else:

- A fixed-length cut is rejected. PNG signatures and JPEG `SOI`/`APP0` are identical across
  files, so a restorer just writes the constant back.
- Cuts are per format and target the fields that vary per file: PNG `IHDR` data **and CRC**,
  the WebP frame header, JPEG `SOF0`.
- Constant runs are removed from the file but not stored in the fragment — they are
  regenerated on restore.
- Formats without a parser fail loudly instead of falling back to a fixed cut.

Because the fragment is a per-file key rather than a shared constant, publishing the
algorithm does not weaken it (Kerckhoffs). Only the fragments are secret.

## Status

| | |
| --- | --- |
| `detect()` | done |
| `locate()` / `strip()` / `restore()` | not implemented |

The design rationale is documented in the repository README.

## License

MIT
