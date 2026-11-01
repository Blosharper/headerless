# Contributing

Thanks for looking. headerless strips format-defining header fields from binary assets
at build time and restores them in the client. It is **not encryption or DRM**. Read
[README.md](README.md), especially *The idea* and *Honest limits*, before a first patch,
because those sections decide most review questions.

## Issues first

Open an issue before a substantial change, so the decision and its reasons are written
down before the code. A good defect report names:

1. the versions of `headerless`, `vite-plugin-headerless`, Vite and Node, and the
   browser if the failure is at runtime;
2. the plugin options you used;
3. the smallest asset that fails, what happened, verbatim, and what you expected.

⚠️ **Never post assets you may not share, or the fragments from a product you ship.**
This repository is public, and whoever has the fragments can restore that build's
assets. Reproduce with a small test image.

Restoring assets by locating the fragments, or by reading client memory, is within the
stated limits and is not a defect. A report is welcome when a stripped file keeps
something the documentation says is removed, or when a claim in the documentation is
wrong.

## Before you open a pull request

CI's `test` job runs these commands on Node 22:

```bash
npm ci
npm run build
npm test
```

The build comes before the tests on purpose: `vite-plugin-headerless` generates its
types against the built core.

To work on one package, run `npm test` inside `packages/headerless` or
`packages/vite-plugin-headerless`. `npm run demo` serves the core package's demo.

## What a change has to clear

- **Unknown formats fail the build.** Never fall back to a fixed cut. It would produce
  files that are stripped but not protected.
- **Format is detected from magic bytes.** Extensions are not trusted.
- **The fragment stays a per-file key.** Do not add a shared constant cut. Publishing
  the algorithm is safe only because the fragment differs per file.
- **Constants are regenerated, not stored,** and the CRC stays out of the output. Left
  in place, it gives a restorer a way to verify guesses.
- **A new format is a complete parser.** It adds a module in
  `packages/headerless/src/formats/`, detection in `detect.ts`, tests for strip and
  restore, and a row in the *Supported formats* table.
- **Claims stay honest.** Do not describe the output as encrypted or secure beyond what
  the code does.

## Commits and pull requests

[Conventional Commits](https://www.conventionalcommits.org/), with a scope where one
fits: `feat(webp):`, `fix(vite-plugin):`, `docs(readme):`. Subject and body in English,
one unit of work per commit.

Every change reaches `main` as a pull request and is **squash-merged**, so:

- **The pull request title is the commit subject on `main`** and must itself be a
  Conventional Commit subject. For a single-commit branch, GitHub uses that commit's
  subject, so keep the two the same. release-please reads the subject to pick the next
  version: `feat` bumps the minor, `fix` and `perf` the patch. While a package is below
  1.0.0, a breaking change (`!` or a `BREAKING CHANGE:` footer) bumps the minor. Other
  types do not cut a release on their own. See [RELEASING.md](RELEASING.md).
- **The squash body is made of the branch's commit messages**, not of the pull request
  description. Footers that must reach `main`, such as `Closes #N` or
  `BREAKING CHANGE:`, go in a commit message.
- **The required check is `test`.** It has to be green before the merge.

## Licence

Contributions are accepted under the MIT licence in [LICENSE](LICENSE).
