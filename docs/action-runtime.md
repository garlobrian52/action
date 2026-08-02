# Action runtime — dispatch, version PR, and publish detection

Engineering notes for the Changesets Release Action control flow in `src/index.ts` and `src/run.ts`.

Related docs: [`README.md`](../README.md) (usage) · [`auth-and-publishing.md`](./auth-and-publishing.md) · [`push-changes-internals.md`](./push-changes-internals.md) · [`troubleshooting.md`](./troubleshooting.md).

---

## 1. Intent

Answer “why did the action exit / open a PR / publish?” from source, without reading the full `switch` in `src/index.ts` and the PR assembly in `runVersion`.

---

## 2. Startup (before dispatch)

Order in `src/index.ts`:

1. Resolve GitHub token (`GITHUB_TOKEN` env, else `github-token` input). Fail if empty.
2. Resolve `cwd` via `path.resolve(cwd input || "")`, validate `commitMode` (`git-cli` | `github-api`), construct `Git` with that `cwd` (+ Octokit when `github-api`).
3. Optionally `setupGitUser` (`true` by default).
4. Write `$HOME/.netrc` for `github.com` so git-cli pushes authenticate.
5. `readChangesetState()` → filtered `changesets` list (see §3).
6. Set outputs early: `published=false`, `publishedPackages=[]`, `hasChangesets=<bool>`.

`hasChangesets` is set **before** the dispatch `switch`, so custom-publish workflows that key off that output see the filtered list even when this run does not publish.

### `cwd` input — verified wiring

After #486 the action no longer calls `process.chdir`. `cwd` is passed explicitly where supported:

| Call site | Receives `cwd` input? |
|-----------|------------------------|
| `new Git({ cwd })` | Yes |
| `runPublish({ cwd })` | Yes |
| Initial `readChangesetState()` (dispatch) | **No** — defaults to `process.cwd()` |
| `runVersion(...)` from `index.ts` | **No** — defaults to `process.cwd()` |

`runVersion` itself accepts `cwd` and tests pass it; the entrypoint currently omits it. README / `action.yml` describe this pass-through accurately (post-#486 / docs PR #14). Prefer keeping the package root (and `.changeset/`) at the Actions job working directory, or treat non-root `cwd` as best-effort for publish/git only.

---

## 3. Pre-mode changeset filtering (`src/readChangesetState.ts`)

| Condition | Returned `changesets` | Returned `preState` |
|-----------|----------------------|---------------------|
| Not in pre mode | All changesets from `@changesets/read` | `undefined` |
| `preState.mode === "pre"` | Changesets **whose ids are not** in `preState.changesets` | The pre-state object |

Changesets already consumed into the current pre release are excluded. That can make `hasChangesets` false while files still exist under `.changeset/`, which is why a merge of a pre Version Packages PR can enter the publish path.

---

## 4. Dispatch state machine (`src/index.ts`)

```
hasChangesets?   hasPublishScript?   hasNonEmptyChangesets?
     no                 no              —     → exit (log: no publish script)
     no                yes              —     → publish path (runPublish + npm auth)
    yes                 —              no     → exit (log: all changesets empty)
    yes                 —             yes     → version path (runVersion)
```

| Case | Condition | Behavior |
|------|-----------|----------|
| No-op | No changesets, no `publish` input | Log and return. Typical after a Version Packages PR merge when the workflow omits `publish`. |
| Publish | No changesets, `publish` set | npm auth (see auth doc), then `runPublish`. |
| Empty skip | Changesets exist, every one has `releases.length === 0` | Log `All changesets are empty; not creating PR` and return. `hasChangesets` is still `"true"`. |
| Version | At least one non-empty changeset | `runVersion` → set `pullRequestNumber`. |

**Pitfall:** An empty-changeset-only run does **not** create or update a Version Packages PR, but `hasChangesets` remains `true`. Custom `if: hasChangesets == 'false'` publish steps will not run.

---

## 5. Version path — `runVersion` (`src/run.ts`)

### Branch names

| Name | Source |
|------|--------|
| Release base `branch` | Input `branch`, else `github.context.ref` with `refs/heads/` stripped |
| Version branch | `changeset-release/<branch>` |

The Version Packages PR is always `head: changeset-release/<branch>` → `base: <branch>`.

### Steps (order matters)

1. **Re-read pre-state** via `readChangesetState(cwd)` (for PR title/body / commit suffix).
2. **`git.prepareBranch(versionBranch)`** — git-cli: checkout/create + hard reset to `github.context.sha`; github-api: no-op.
3. Snapshot package versions (`getVersionsByDirectory`) **before** versioning.
4. Run version command:
   - Custom `version` input → `script.split(/\s+/)` then `exec` with `GITHUB_TOKEN` in env (no shell; quoted args with spaces will not work as a single argv).
   - Default → resolve `@changesets/cli` from `cwd`; if CLI `< 2.0.0` run `bump`, else `version`. Missing CLI → clear error asking to install `@changesets/cli`.
5. Diff package versions → `getChangedPackages`; for each, read `CHANGELOG.md` and extract the entry for the new version (`getChangelogEntry` in `src/utils.ts`).
6. **List open PRs** for `owner:versionBranch` → `base` **before** pushing (see below).
7. **`git.pushChanges`** with commit message `commit` input (default `Version Packages`), plus ` (preState.tag)` when in pre mode.
8. Build PR body (`getVersionPrBody`), sort packages (public before private; higher bump first).
9. Create PR, or update **only the first** open PR returned by the list (`existingPullRequests.data[0]`, forced `state: "open"`). Extra open PRs for the same head/base are ignored.

### Version-path pitfalls

| Situation | Actual behavior |
|-----------|-----------------|
| Custom `version` / `publish` with shell metacharacters | Split on whitespace only — not run through a shell. Prefer a package.json script (`yarn version`) over inline `bash -c "…"`. |
| Version script leaves no package version diffs | PR is still created/updated; `# Releases` has no package sections. |
| Changed package missing `CHANGELOG.md` | `runVersion` throws on `readFile` (unlike publish `createRelease`, which skips `ENOENT`). |
| Several open Version Packages PRs for the same head | Only `data[0]` is updated/reopened; others stay stale. |

### Why list PRs before push

With `commitMode: github-api`, `@changesets/ghcommit` may reset the release branch to the base SHA before creating the new commit. GitHub can close open PRs when the head ref briefly matches the base. Listing first lets the action update/reopen the same PR after the push.

### PR title and commit message

| Input | Default | Pre-mode suffix |
|-------|---------|-----------------|
| `title` | `Version Packages` | ` (tag)` e.g. `Version Packages (next)` |
| `commit` | `Version Packages` | same |

### PR body size limits

GitHub rejects bodies over **65536** characters. The action caps at **`MAX_CHARACTERS_PER_MESSAGE = 60000`**:

1. Full body = header + optional pre-mode warning + `# Releases` + per-package changelog sections.
2. If over limit → keep headers only (omit changelog bodies) and note omission.
3. If still over → omit all release details and note omission.

### Pre-mode warning in the body

When `preState` is set, the body includes a warning that `branch` is in pre mode and how to exit (`changeset pre exit` on that branch).

### Changelog parsing constraints (`getChangelogEntry` in `src/utils.ts`)

- Finds a markdown heading whose text **exactly equals** the new version string (e.g. `3.0.1`, not `v3.0.1`).
- Slices until the next heading of the **same depth**.
- While walking that slice, headings containing `major` / `minor` / `patch` update `highestLevel` for `sortTheThings` (public packages before private; higher bump first).
- **Always returns** `{ content, highestLevel }` — never `null` / `undefined`.
- If the version heading is **missing**, `content` is the **entire** changelog AST stringified (no slice), and `highestLevel` reflects `major`/`minor`/`patch` headings anywhere in the file.
- Version path: missing `CHANGELOG.md` for a changed package throws on `readFile`. Publish path: see §6.

---

## 6. Publish path — detection and GitHub releases (`runPublish`)

Runs only from the dispatch publish case (no remaining changesets + `publish` input).

1. Execute the `publish` script (`script.split(/\s+/)`), injecting `GITHUB_TOKEN` into the child env.
2. Parse **stdout** for new tags (not git tags on disk):
   - **Monorepo / non-root tool:** lines matching `New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)`.
   - **Root package:** first line matching `New tag:` → treat the single root package as released; GitHub tag name `v{version}` (then `break` — further `New tag:` lines ignored).
3. If `createGithubReleases` is true (default) and packages were detected:
   - Push each tag via `git.pushTag` (see [`push-changes-internals.md`](./push-changes-internals.md) §5 — github-api tags `github.context.sha`; failures only warn).
   - `repos.createRelease` with `body` from `getChangelogEntry(...).content`; `prerelease` when the version contains `-`.
   - Missing changelog file → skip that package’s release silently (`ENOENT`).
   - Missing version heading → **does not throw**. `getChangelogEntry` still returns an object, so the Release body can be the **full** changelog. The `if (!changelogEntry)` check in `createRelease` is unreachable with the current helper.
4. If `createGithubReleases` is false → **no** `pushTag` and **no** GitHub Release, even when `New tag:` lines were parsed. `published` / `publishedPackages` still reflect stdout detection.

If stdout has no `New tag:` lines, result is `{ published: false }` and outputs stay at the startup defaults. Your publish script must print `New tag: …` (changeset publish does) or the action will not treat the run as published.

---

## 7. Outputs (when set)

| Output | Set when |
|--------|----------|
| `hasChangesets` | Always (after filtering), before dispatch |
| `published` / `publishedPackages` | Startup defaults; overwritten only on successful publish detection |
| `pullRequestNumber` | Version path only |

---

## 8. Related codepaths

| Path | Role |
|------|------|
| `src/index.ts` | Token, `.netrc`, dispatch switch, outputs |
| `src/readChangesetState.ts` | Pre-mode filter |
| `src/run.ts` → `runVersion` / `getVersionPrBody` / `runPublish` | Version PR lifecycle + publish detection |
| `src/utils.ts` → `getChangelogEntry` / `getChangedPackages` / `sortTheThings` | Changelog slice + package ordering |
| `src/git.ts` | `prepareBranch` / `pushChanges` / `pushTag` (see push-changes doc) |
| `action.yml` | Inputs/outputs; action runs on Node 24 (`runs.using: node24`) |
