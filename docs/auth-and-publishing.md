# Auth & publishing — `github-token`, `.npmrc`, and trusted publishing

Engineering notes for token resolution and npm auth in `src/index.ts` / `src/run.ts` (behavior shipped for `@changesets/action@1.7.0`).

Related docs: [`README.md`](../README.md) (examples) · [`action-runtime.md`](./action-runtime.md) · [`troubleshooting.md`](./troubleshooting.md).

---

## 1. Intent

- Stop requiring every workflow to pass `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- Support both classic `NPM_TOKEN` publishes and npm **trusted publishing** (OIDC) without writing `_authToken=undefined` into `.npmrc`.

---

## 2. GitHub token resolution (`src/index.ts`)

```ts
let githubToken = process.env.GITHUB_TOKEN || core.getInput("github-token");
```

| Priority | Source | Notes |
|----------|--------|--------|
| 1 | `process.env.GITHUB_TOKEN` | Legacy; wins when set so old workflows keep working |
| 2 | input `github-token` | Defaults to `${{ github.token }}` in `action.yml` |

If both are empty, the action fails with: `Please add the GITHUB_TOKEN to the changesets action`.

### Where the token is used

1. **Octokit** — `setupOctokit(githubToken)` for PRs, releases, and (with `commitMode: github-api`) commits/tags.
2. **`.netrc`** — written as `password` for `github.com` so git-cli pushes authenticate.
3. **Child env** — `runPublish` / `runVersion` pass `GITHUB_TOKEN: githubToken` into the publish/version script env so nested tools see the same token even when the workflow did not set `env.GITHUB_TOKEN`.

### Constraints

- Default `github.token` permissions depend on the workflow `permissions:` block. Opening/updating release PRs typically needs `contents: write` and `pull-requests: write`.
- Prefer a PAT / GitHub App token via `github-token` (or `GITHUB_TOKEN` env) when you need to trigger other workflows (`github.token` often cannot).

---

## 3. npm auth during publish (`src/index.ts`)

This block runs only when there are **no** changesets left and a `publish` input is set (publish path).

### Decision tree

```
NPM_TOKEN set?
  yes → ensure $HOME/.npmrc has //registry.npmjs.org/:_authToken=...
  no  → ACTIONS_ID_TOKEN_REQUEST_TOKEN && ACTIONS_ID_TOKEN_REQUEST_URL?
          yes → log "using npm trusted publishing" (no .npmrc auth write)
          no  → log "assuming npm is already authenticated"
```

### `.npmrc` rules when `NPM_TOKEN` is defined

| Existing `$HOME/.npmrc` | Behavior |
|-------------------------|----------|
| Missing | Create file with auth line |
| Present, **no** npmjs auth line | Append auth line |
| Present, **has** `//registry.npmjs.org/:_authToken=` (or `_authToken`) | Leave file unchanged |

Auth-line detection matches npm CLI style: `/^\s*\/\/registry\.npmjs\.org\/:[_-]authToken=/i`.

### Trusted publishing

- Requires job permission `id-token: write` so GitHub injects the OIDC request env vars.
- Configure the package on npmjs.com for the GitHub repo/workflow (npm trusted publishers UI).
- Do **not** set `NPM_TOKEN` in that job; an empty/undefined token must not be written to `.npmrc` (fixed in #545).

### Pitfalls

1. **Existing `.npmrc` without auth** — action appends; a malformed prior `.npmrc` can still break `npm publish`.
2. **Custom registries** — auto-`.npmrc` only targets `registry.npmjs.org`. For GitHub Packages or other hosts, provide your own `.npmrc` (or `registry-url` / publish config) before the action.
3. **OIDC without npm package trust config** — action proceeds; publish fails at the registry with an auth error. Check npm trusted-publisher setup, not only Actions logs.
4. **`NPM_TOKEN` + OIDC both present** — token path wins; `.npmrc` auth is written from `NPM_TOKEN`.

---

## 4. Octokit throttling (`src/octokit.ts`)

Every Octokit instance is created with `@octokit/plugin-throttling`:

| Event | Behavior |
|-------|----------|
| Primary rate limit | Warning; retry if `retryCount <= 2` after `retryAfter` seconds |
| Secondary rate limit | Same retry policy |

After three attempts the request fails. See [`troubleshooting.md`](./troubleshooting.md) §6.

---

## 5. Related codepaths

| Path | Role |
|------|------|
| `action.yml` → `github-token` | Default `${{ github.token }}` |
| `src/index.ts` | Token resolve, `.netrc`, `.npmrc` / OIDC branch, dispatch publish vs version |
| `src/octokit.ts` | Throttled Octokit factory |
| `src/run.ts` → `runPublish` / `runVersion` | Inject `GITHUB_TOKEN` into script env |
| `docs/action-runtime.md` | When the action publishes, opens a PR, or exits |
| `docs/push-changes-internals.md` | How commits are pushed after versioning |
| `docs/troubleshooting.md` | Consumer pitfall index |
