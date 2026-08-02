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
| npm 401 / auth errors | Token or OIDC misconfigured | [`auth-and-publishing.md`](./auth-and-publishing.md): `NPM_TOKEN` vs trusted publishing (`id-token: write`), custom registries need your own `.npmrc`. |

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
| Release creation throws | Changelog has no heading equal to the version | Missing `CHANGELOG.md` skips that release (`ENOENT`); missing **entry** throws. |

Tag names: monorepo `{name}@{version}`; root package `v{version}`. Details: [`push-changes-internals.md`](./push-changes-internals.md) §5.

---

## 5. `commitMode: github-api` issues

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Version PR closed then reopened / flicker | Branch reset to base SHA before new commit | Action lists open PRs **before** push and force-opens on update (#488). |
| Error about symlink or executable | Changed symlink/executable in the version commit | API cannot add/update those; use `git-cli` (default) or avoid changing them. |
| `setupGitUser: true` had no effect | github-api path | `Git.setupUser` is a no-op when Octokit is set; attribution follows the token owner. |

---

## 6. GitHub API rate limits

`setupOctokit` (`src/octokit.ts`) uses `@octokit/plugin-throttling`:

- On primary or secondary rate limit → warning log.
- Retries while `retryCount <= 2` (up to three attempts), waiting `retryAfter` seconds.
- Further limits fail the request.

Large monorepos with many Releases or frequent version-PR updates are the usual trigger.

---

## 7. Permissions quick checklist

Minimum for opening/updating the Version Packages PR with `github.token`:

```yaml
permissions:
  contents: write
  pull-requests: write
```

Add `id-token: write` when using npm trusted publishing (no `NPM_TOKEN`). Use a PAT / GitHub App token via `github-token` when the default token cannot trigger downstream workflows.
