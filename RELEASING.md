# Releasing

The cut is one click: merge the release pull request. Everything either side of
that click is [`.github/workflows/release.yml`](.github/workflows/release.yml),
and no npm credential exists on any machine — the publish authenticates to the
registry over OIDC (npm trusted publishing), so there is no token to leak and no
2FA prompt to answer. See [Publishing](#publishing).

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
- **That pull request is merged** → the merge is a push to `main`, so
  `release.yml` runs again; this time release-please tags each released
  package (`headerless-vX.Y.Z`, `vite-plugin-headerless-vX.Y.Z`), creates the
  GitHub releases, and the same run publishes to npm — core first, then the
  plugin.

Squash-merge the release pull request, so the commit on `main` keeps its
generated `release:` subject.

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

1. Land the work on `main` with conventional-commit subjects. CI runs on every
   push.
2. Wait for the `release` run to open or update the release pull request.
3. Read the diff — the versions and the generated changelogs are the whole
   review. Optionally run the suite against the release branch: **Actions →
   ci → Run workflow →** the branch the pull request is on (see below for why
   it is not automatic).
4. **Merge it.** That is the cut.
5. Watch the second `release` run: it tags, creates the GitHub releases, and
   publishes.
6. Confirm: `npm view headerless version` and
   `npm view vite-plugin-headerless version`; each npm page shows the
   provenance attestation linking the tarball to the workflow run.

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

**Not yet configured — this is the one step the automation cannot do.** The
form needs the package owner's npm account, once per package:

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

**The next release is the first automated publish, and only that run can prove
the OIDC exchange** — everything up to the registry is testable here, the
token swap itself is not. Watch it: **Actions → release →** the run for the
release commit, the *Publish … to npm* steps. A rejection there names its own
cause; a mismatch against the trusted publisher form above is the first thing
to re-read, since npm matches the claim by repository and workflow filename
and accepts no approximation of it.

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

## Why the release pull request has no CI checks

A pull request opened with the default `GITHUB_TOKEN` starts no other workflow
runs — GitHub suppresses that to prevent recursive runs — so `ci.yml` does not
fire on release-please's pull request. The usual fix is a personal access
token, and this repository deliberately does not use one:

- The base of the release pull request is a commit on `main` that `ci.yml`
  already tested on push.
- The pull request adds only generated version and changelog text. There is no
  source change for a test run to have an opinion about.
- The token would be the only long-lived credential in the repository.

A push of your own to the release branch (say, to resolve a conflict) is not
`GITHUB_TOKEN`'s, so it does start a `pull_request` run — which then sits in
`action_required` until approved from the Actions tab. And the release branch
is named by release-please from its config, so do not hard-code it; anything
scripted reads it from the pull request: `gh pr view <n> --json headRefName`.

If a rendered check is ever wanted anyway, it takes no edit to `release.yml`:
create a fine-grained personal access token scoped to this repository with
**Contents: read and write** and **Pull requests: read and write**, store it
as the repository secret `RELEASE_PLEASE_TOKEN`, and the workflow picks it up
(`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`). The cost is a
credential to rotate.
