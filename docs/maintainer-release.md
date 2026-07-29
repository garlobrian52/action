# Maintainer release — versioning and publishing this action

How **this repository** ships `@changesets/action` (not the generic consumer README). Covers `version-or-publish.yml`, `scripts/{bump,release,release-pr}.ts`, and the `/release-pr` comment workflow.

User-facing action docs: [`README.md`](../README.md). Auth internals: [`auth-and-publishing.md`](./auth-and-publishing.md).

---

## 1. Intent

Publish a built `dist/` on a **release-line branch** (`v1`, `v2`, …) so consumers can pin `changesets/action@v1`. Snapshot PR builds use a separate `pr-release` branch via a PR comment.

---

## 2. Production path — Version or Publish

**Workflow:** `.github/workflows/version-or-publish.yml`  
**Trigger:** `push` to `main`  
**Concurrency:** `${{ github.workflow }}-${{ github.ref }}`

| Step | What runs |
|------|-----------|
| Setup | `./.github/actions/ci-setup` → Node from `.node-version` (`v24.11.0`), `yarn install --frozen-lockfile` |
| Build | `yarn build` (Rollup → `dist/index.js`) |
| Action | `uses: ./` with `version: yarn bump` and `publish: yarn release` |

The local action decides version-PR vs publish the same way consumers do: if changesets remain → version path; if none remain and `publish` is set → publish path.

`GITHUB_TOKEN` is still passed via `env` (legacy; optional after the default `github-token` input).

### `yarn bump` → `scripts/bump.ts`

1. `changeset version` (applies changesets, updates `CHANGELOG.md` / `package.json`).
2. Rewrites every `changesets/action@…` reference in `README.md` to `changesets/action@v{major}` using the **post-bump** `package.json` version (major only).

Those edits land on the `changeset-release/<branch>` Version Packages PR opened by the action.

### `yarn release` → `scripts/release.ts`

Runs only on the publish path (no remaining changesets):

1. `git ls-remote` for `refs/tags/v{version}` — if the tag already exists, exit without publishing.
2. Detach HEAD, force-add `dist/`, commit as `v{version}`.
3. `changeset tag` (creates local tags from the package version).
4. Force-push `HEAD` + tags to `origin` as `refs/heads/v{major}` (e.g. `v1`).

Consumers following `@v1` track that branch tip (built action), not necessarily `main`.

### Constraints

- `engines.node` is `>= 24`; CI and the action runtime use Node 24.
- `dist/` is gitignored for normal work; release scripts force-add it onto the release-line commit only.
- Publishing tags/branches needs a token that can push to the default remote (workflow `GITHUB_TOKEN` on this repo).

---

## 3. Snapshot PR path — `/release-pr`

**Workflow:** `.github/workflows/release-pr.yml`  
**Trigger:** `issue_comment` with body starting `/release-pr` on a pull request.

### Hard gate (forks)

Every job is gated with:

```yaml
if: github.repository == 'changesets/action'
```

On **forks** (including this one when the remote is not `changesets/action`), the workflow never runs meaningful jobs. Use the upstream repo or temporarily adjust the guard only for intentional fork testing.

### Authorization (`release_check`)

Allowed `author_association` values: `MEMBER`, `OWNER`, `COLLABORATOR`. Others fail the check job.

Reactions on the triggering comment: `eyes` while in progress → `rocket` on success / `-1` on failure; in-progress reaction is deleted when finished. A PR comment links the run.

### Release job (`scripts/release-pr.ts` via `yarn release:pr`)

1. Check out the commented PR (`gh pr checkout`).
2. If head ref starts with `changeset-release/`, `git reset --hard HEAD~1` (drop the version commit so snapshot versioning starts from the pre-bump tree).
3. `yarn changeset version --snapshot pr{N}` where `N` is the issue/PR number.
4. `yarn build`.
5. Configure git user as `github-actions[bot]`.
6. `yarn release:pr` → detach, force-add `dist/`, commit `v{version}`, force-push to `refs/heads/pr-release` (**no** `changeset tag` / release-line branch).

### Constraints

- Comment must be on a **PR** issue (`github.event.issue.pull_request`).
- Snapshot versions are for trying the built action from `pr-release`; they are not the production `v{major}` line.
- Timeout: release job 20 minutes; failure reporter 2 minutes.

---

## 4. Local developer commands

| Command | Role |
|---------|------|
| `yarn build` | Produce `dist/` (required before testing `uses: ./`) |
| `yarn typecheck` / `yarn test` | Same checks as `.github/workflows/ci.yml` |
| `yarn bump` | Apply changesets + rewrite README action tags (usually via CI) |
| `yarn release` | Tag + push release-line branch (usually via CI publish path) |
| `yarn release:pr` | Push snapshot build to `pr-release` (usually via `/release-pr`) |

Node must satisfy `engines` (`>= 24`). On older hosts, package installs may need engine overrides; prefer Node 24 to match `.node-version`.

---

## 5. Related codepaths

| Path | Role |
|------|------|
| `.github/workflows/version-or-publish.yml` | Dogfood `uses: ./` on `main` |
| `.github/workflows/release-pr.yml` | Comment-driven snapshot publish |
| `.github/actions/ci-setup` | Shared Node 24 + yarn install |
| `scripts/bump.ts` | Version + README tag rewrite |
| `scripts/release.ts` | Production release-line publish |
| `scripts/release-pr.ts` | Snapshot `pr-release` push |
| `src/index.ts` / `src/run.ts` | Version vs publish decision inside the action |
