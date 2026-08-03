# Troubleshooting — consumer pitfalls

Scan-friendly fixes for common `@changesets/action` surprises. Behavior verified against `src/index.ts`, `src/run.ts`, `src/git.ts`, and `src/readChangesetState.ts`.

Deeper notes: [`action-runtime.md`](./action-runtime.md) · [`auth-and-publishing.md`](./auth-and-publishing.md) · [`push-changes-internals.md`](./push-changes-internals.md) · user examples in [`README.md`](../README.md).

---

## 1. Version Packages PR never opens

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Log: `All changesets are empty; not creating PR` | Every remaining changeset has `releases: []` | Remove or fill empty changesets. `hasChangesets` stays `"true"`. |
| Log: no changesets / no publish script | Merge cleared changesets and workflow omits `publish` | Expected no-op. Add `publish` if you want the publish path. |
| Changeset files exist but action says none | Pre mode already consumed those ids | `readChangesetState` filters ids listed in `preState.changesets` while `mode === "pre"`. |

---

## 2. Publish did not run / `published` is false

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Custom step `if: hasChangesets == 'false'` never runs | Empty-changeset skip left `hasChangesets=true` | See §1; empty changesets block both the Version PR and this pattern. |
| Action ran publish script but `published` is `false` | Stdout had no `New tag:` lines | Detection parses **stdout only**. Monorepo lines must match `New tag: name@version`; root needs any `New tag:` line. |
| Publish throws `Package "…" not found` | Monorepo `New tag:` name not in `getPackages(cwd)` | Typo, wrong `cwd`, or private/tooling package filtered from the workspace. |
| npm 401 / auth errors | Token or OIDC misconfigured | [`auth-and-publishing.md`](./auth-and-publishing.md): `NPM_TOKEN` vs trusted publishing (`id-token: write`), custom registries need your own `.npmrc`. |
| Later step lost other `.netrc` machines | Action `writeFile`s `$HOME/.netrc` every run | [`auth-and-publishing.md`](./auth-and-publishing.md) §2 — recreate multi-host `.netrc` after the action if needed. |

---

## 3. `cwd` input surprises

After #486 the action does **not** call `process.chdir`.

| Works with `cwd` | Still uses job `process.cwd()` |
|------------------|--------------------------------|
| `Git` (commit/push/tag via git-cli) | Initial `readChangesetState()` in `src/index.ts` |
| `runPublish({ cwd })` (publish script + package discovery) | `runVersion(...)` call from the entrypoint (omits `cwd`) |

**Practical rule:** keep the package root (and `.changeset/`) as the job working directory. Treat non-root `cwd` as best-effort for publish/git scoping only.

---

## 4. Tags and GitHub Releases

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| No tags and no Releases after publish | `createGithubReleases: false` | That flag skips **both** `pushTag` and `repos.createRelease`. |
| Tag points at unexpected commit (`commitMode: github-api`) | `pushTag` uses `github.context.sha` | Tag is the workflow triggering SHA, not a commit your publish script created later. |
| Warning `Failed to create tag …` then Release still appears | Tag already existed remotely | createRef errors are swallowed as warnings; `createRelease` still runs. |
| git-cli: push tag failed | Local tag missing | Publish script must create the tag before the action pushes it. |
| Release body looks like the whole changelog | No heading text **exactly** equal to the version | `getChangelogEntry` always returns an object; missing heading does **not** throw — body becomes the full file. Fix changelog headings (plain version string). |
| One package skipped, others released | That package has no `CHANGELOG.md` | `ENOENT` skips only that package’s GitHub Release; tags may still have been pushed for it. |

Tag names: monorepo `{name}@{version}`; root package `v{version}`. Details: [`push-changes-internals.md`](./push-changes-internals.md) §5.

---

## 5. Version Packages PR content / scripts

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Version step fails reading `CHANGELOG.md` | Custom `version` bumped a package without writing its changelog | Version path requires a changelog file per changed package; publish `createRelease` is more lenient (`ENOENT` skip). |
| `version: bash -c "…"` mis-parses | `script.split(/\s+/)` — no shell | Use a package.json script, or a single command + simple argv. |
| PR opens with empty `# Releases` | Version command changed no `package.json` versions | `getChangedPackages` compares versions before/after the version command. |
| Duplicate open Version Packages PRs; only one updates | List returns multiple; action updates `data[0]` only | Close extras; keep a single `changeset-release/<branch>` PR. |
| PR diff suddenly empty / PR auto-closed (`commitMode: git-cli`) | Version script left a **clean** tree after `prepareBranch` reset | git-cli still **force-pushes** HEAD; without a new commit that is the base SHA. See [`push-changes-internals.md`](./push-changes-internals.md) §1. |
| Package order in `# Releases` looks wrong | `highestLevel` saw `Major`/`Minor`/`Patch` headings **above** the version entry | Newest-first changelogs can inflate sort order for older entries; body `content` can still be correct. [`action-runtime.md`](./action-runtime.md) §5. |
| No `(tag)` suffix / pre warning after `changeset pre exit` | `readChangesetState` only returns `preState` when `mode === "pre"` | Expected; exit mode is treated as normal releases. |

See [`action-runtime.md`](./action-runtime.md) §5.

---

## 6. `commitMode: github-api` issues

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Version PR closed then reopened / flicker | Branch reset to base SHA before new commit | Action lists open PRs **before** push and force-opens on update (#488). |
| Error about symlink or executable | Changed symlink/executable in the version commit | API cannot add/update those; use `git-cli` (default) or avoid changing them. |
| `setupGitUser: true` had no effect | github-api path | `Git.setupUser` is a no-op when Octokit is set; attribution follows the token owner. |

---

## 7. GitHub API rate limits

`setupOctokit` (`src/octokit.ts`) uses `@octokit/plugin-throttling`:

- On primary or secondary rate limit → warning log.
- Retries while `retryCount <= 2` (up to three attempts), waiting `retryAfter` seconds.
- Further limits fail the request.

Large monorepos with many Releases or frequent version-PR updates are the usual trigger.

---

## 8. Permissions quick checklist

Minimum for opening/updating the Version Packages PR with `github.token`:

```yaml
permissions:
  contents: write
  pull-requests: write
```

Add `id-token: write` when using npm trusted publishing (no `NPM_TOKEN`). Use a PAT / GitHub App token via `github-token` when the default token cannot trigger downstream workflows.
