# Releasing

The cut is zero clicks: a releasable commit landing on `main` carries itself
to npm. Everything between those two points is
[`.github/workflows/release.yml`](.github/workflows/release.yml) — it opens
the release pull request, puts a real CI run on it, merges it once green, tags,
and publishes — and no credential exists on any machine or in any secret: the
publish authenticates to the registry over OIDC (npm trusted publishing), and
the automation itself runs entirely on the workflow's own `GITHUB_TOKEN`, so
there is no token to leak, no PAT to rotate, and no 2FA prompt to answer. See
[Publishing](#publishing) and [How the release pull request merges
itself](#how-the-release-pull-request-merges-itself).

This repository ships two packages from one tree: `headerless` (the
bundler-agnostic core) and `vite-plugin-headerless` (the Vite adapter, which
depends on the core). release-please runs in manifest mode over both; the
`node-workspace` plugin keeps them honest together — when the core releases,
the plugin's dependency range is bumped and the plugin releases too, so the
registry never holds a plugin that names a core version it cannot install.

## The loop

Every push to `main` runs `release.yml`, which hands the new commits to
[release-please](https://github.com/googleapis/release-please-action):

- **Nothing releasable since the last tags** → the run does nothing. Commit
  types release-please hides from the changelog (`docs`, `test`, `ci`,
  `build`, `chore`, `refactor`, `style`) do not open a release pull request on
  their own.
- **Something releasable** → it opens, or updates, a pull request containing
  only generated changes: each released package's `package.json` version and
  `CHANGELOG.md`, plus `.release-please-manifest.json`. `feat` bumps the
  minor, `fix` and `perf` bump the patch. A `!` or a `BREAKING CHANGE:` footer
  bumps the **minor** while a package is pre-1.0 (`bump-minor-pre-major`) —
  1.0.0 is a deliberate act, not the side effect of one commit. To force a
  version, put `Release-As: X.Y.Z` in a commit footer. Scope which package a
  commit releases by which files it touches — release-please attributes
  commits by path.
- **A release pull request is open** → the same run drives it: it dispatches
  `ci.yml` onto the release branch, waits for the `test` check to pass on the
  pull request's head, squash-merges it, and dispatches a fresh `release.yml`
  run. That fresh run finds the merged release, tags each released package
  (`headerless-vX.Y.Z`, `vite-plugin-headerless-vX.Y.Z`), creates the GitHub
  releases, and publishes to npm — core first, then the plugin.

The pull request is squash-merged so the commit on `main` keeps its generated
`release:` subject. Merging it by hand (also squash) still works and simply
short-circuits the driver — the resulting push runs `release.yml`, which tags
and publishes exactly as above.

## One-time setup (owner, GitHub)

**Settings → Actions → General → Workflow permissions → tick "Allow GitHub
Actions to create and approve pull requests."** It is off by default, and while
it is off release-please cannot open the release pull request at all — the run
fails with *GitHub Actions is not permitted to create or approve pull
requests*. Nothing in a workflow file can grant this; it is a repository
setting.

The neighbouring "Workflow permissions" radio can stay on the read-only
default: `release.yml` declares per job the write scopes it needs.

`release-please-config.json` carries a `bootstrap-sha`. It marks where
release-please stops reading history on its very first run, so the first
changelogs cover the release and not the whole repository. It is pinned to the
v0.1.3 commit and is not maintained afterwards.

## Cutting a release

1. Land the work on `main` with conventional-commit subjects. That is the
   whole job: the same push's `release` run opens (or refreshes) the release
   pull request, tests it, merges it, and hands off to the run that tags and
   publishes — typically all within a few minutes.
2. Confirm, if you care to watch: **Actions → release** shows the driving run
   and the tag-and-publish run it dispatched; then
   `npm view headerless version` and `npm view vite-plugin-headerless
   version`; each npm page shows the provenance attestation linking the
   tarball to the workflow run.

Because the merge is automatic, **the review happens before `main`, not on
the release pull request** — its diff is only generated version and changelog
text, and by the time you could read it the release may already be out. Decide
the version story when you write the commit subjects (`feat` vs `fix`,
`Release-As:` to force a number). If work must accumulate on `main` without
shipping, land it as non-releasable types, or on a branch — a release pull
request that is open is a release in motion.

## Publishing

**Automated, on the release push.** The second `release` run — the one that
creates the tags — checks out the release commit (every tag it just created
points at that commit) and publishes each package whose release was created.
It authenticates over OIDC (npm trusted publishing): the runner exchanges a
short-lived GitHub token for a publish grant, so there is no `NPM_TOKEN` in
this repository and no OTP to type. That is what `id-token: write` in the
job's permissions is for, and it is also what lets the publish carry
`--provenance`.

`prepublishOnly` in each package runs its `tsup` build before npm packs
anything, and the workflow builds all workspaces first so the plugin's `.d.ts`
generation always finds the core's dist — even on a run where only the plugin
releases.

### The registry side (owner, npmjs.com)

**Configured — recorded here for when it needs to change.** The form needs
the package owner's npm account, once per package:

npmjs.com → *package* → **Settings** → **Trusted Publisher** → *GitHub
Actions*, filled in identically for **`headerless`** and
**`vite-plugin-headerless`**:

- Organization or user: `firejune`
- Repository: `headerless`
- Workflow filename: `release.yml`
- Environment name: *blank* (the workflow declares no environment; a value
  here that the workflow does not match rejects the publish)

The fields are case-sensitive and npm does not validate them on save, so a
typo only surfaces as a failed publish.

Two properties of that configuration are load-bearing in the workflow:

- The publish steps must live in **`release.yml`**. Renaming the file, or
  moving a publish into another workflow, breaks the trusted publisher until
  the form is updated to match.
- They must run on a **GitHub-hosted runner**. npm does not support trusted
  publishing from self-hosted runners, so this job never moves to a private
  machine.

**Only a live publish run proves the OIDC exchange** — everything up to the
registry is testable here, the token swap itself is not. If a publish is
rejected: **Actions → release →** the run for the release commit, the
*Publish … to npm* steps. A rejection there names its own cause; a mismatch
against the trusted publisher form above is the first thing to re-read, since
npm matches the claim by repository and workflow filename and accepts no
approximation of it.

### If the automation is unavailable

The old path still works and needs nothing from the workflow. Publish from the
tagged tree, never from a working `main`:

```sh
npm login                        # once per machine; `npm whoami` to check
git fetch --tags
git checkout headerless-vX.Y.Z   # or vite-plugin-headerless-vX.Y.Z
npm ci
npm run build
npm publish --workspace packages/headerless          # asks for the OTP
npm publish --workspace packages/vite-plugin-headerless
```

Publish only the package(s) the tag names, core before plugin. This
authenticates as a logged-in human with a one-time password. Reach for it when
the automation is broken and a release cannot wait — then fix the workflow.

## How the release pull request merges itself

`main` is protected: the `test` check is required and applies to everyone
(`enforce_admins`). A pull request opened with the default `GITHUB_TOKEN` —
release-please's — starts no other workflow runs (GitHub suppresses that to
prevent recursive runs), so on its own the release pull request would sit
forever with its required check missing. The usual fix is a personal access
token; this repository deliberately does not use one. Instead the `release`
run that opened the pull request drives it home with `GITHUB_TOKEN` alone,
leaning on the two documented exemptions from that suppression —
`workflow_dispatch` runs do start, and dispatched workflows do run:

1. **Check** — it dispatches `ci.yml` onto the release branch and polls the
   dispatched run. That run's `test` job reports its check against the
   branch's head commit, which is the pull request's head, so the required
   check is satisfied by a real build-and-test of the exact release tree. (If
   the head already carries a green `test` — say a human dispatched one — the
   step reuses it.)
2. **Merge** — with the check green, it squash-merges the pull request. A CI
   failure fails the release run instead, and nothing merges: fix `main`, and
   the next push (or the sweeper) retries from scratch.
3. **Hand off** — the merge is a `GITHUB_TOKEN` push, which also starts no
   workflows, so the same step dispatches `release.yml` on `main`. That fresh
   run finds the merged, untagged release and does the tag-and-publish half.
   It creates releases rather than finding an open pull request, so it does
   not re-enter the driver — the chain is two runs, then stops.

**The sweeper.** `release.yml` also runs on a daily schedule. A scheduled run
re-derives everything from repository state, so whatever a dropped handoff
left behind — a merged release pull request whose dispatch never fired, an
open one whose drive failed — is picked up and completed. A sweeper run with
nothing to do exits in seconds.

**What a human can still do.** Everything, just none of it is required:
dispatch `ci.yml` onto the release branch from the Actions tab; squash-merge
the release pull request by hand (the resulting push tags and publishes as
always); dispatch `release.yml` on `main` to force a sweep right now. The one
rule: do not push your own commits to the release branch — release-please
owns it and will overwrite. The branch is named by release-please from its
config, so anything scripted reads it from the pull request rather than
hard-coding it: `gh pr view <n> --json headRefName`.

**The PAT escape hatch** remains wired but unused: store a fine-grained
personal access token scoped to this repository (**Contents: read and
write**, **Pull requests: read and write**) as the secret
`RELEASE_PLEASE_TOKEN` and release-please will open its pull request with
that identity instead, which makes `pull_request` workflows fire on it
natively (`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`). The cost
is the repository's only long-lived credential and the rotation that comes
with it — which is the trade this whole section exists to avoid.
