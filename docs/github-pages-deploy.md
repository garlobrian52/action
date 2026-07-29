# GitHub Pages deploy — `website/` → Pages

This document describes how `.github/workflows/deploy-pages.yml` publishes the static site under `website/` to GitHub Pages (workflow added in PR #4; `enablement` removed in PR #5).

For page content and local preview, see [`tradeweb-china-website.md`](./tradeweb-china-website.md).

---

## 1. Intent

Ship the dependency-free Tradeweb China Access Channels page at a public URL without a separate hosting stack. The workflow uploads the `website/` directory as a Pages artifact and deploys it with the official GitHub Pages actions.

**Not related** to the Changesets Action runtime (`src/`, `action.yml`, release/CI workflows).

**Live URL (this fork):** https://garlobrian52.github.io/action/

---

## 2. Triggers (verified in workflow)

| Trigger | When it runs |
|---------|----------------|
| `push` to `main` | Only if changed paths match `website/**` **or** `.github/workflows/deploy-pages.yml` |
| `workflow_dispatch` | Manual run from the Actions UI (any path filter ignored) |

Pushes that only touch Action source (`src/`, tests, etc.) do **not** redeploy Pages.

---

## 3. Permissions, concurrency, environment

```yaml
permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true
```

- **`pages: write` + `id-token: write`** — required for `actions/deploy-pages` (OIDC to Pages).
- **`contents: read`** — checkout only; the job does not push commits.
- **Concurrency group `pages`** — a newer run cancels an in-flight deploy so only one deploy applies at a time.
- **Environment `github-pages`** — GitHub’s Pages environment; the job URL is set from `steps.deployment.outputs.page_url`.

These permissions are enough to **deploy** an already-enabled Pages site. They are **not** enough for `actions/configure-pages` to create/enable Pages via the API (see pitfalls).

---

## 4. Deploy pipeline (codepath)

Single job `deploy` on `ubuntu-latest`:

| Step | Action | Role |
|------|--------|------|
| 1 | `actions/checkout@v4` | Check out the commit that triggered the workflow |
| 2 | `actions/configure-pages@v5` | Read/configure Pages settings for the deploy (no `enablement` input) |
| 3 | `actions/upload-pages-artifact@v3` with `path: website` | Upload the **`website/` directory contents** as the Pages artifact (not the whole repo) |
| 4 | `actions/deploy-pages@v4` (`id: deployment`) | Publish the artifact; expose `page_url` |

There is **no build step** (no Node/yarn). Whatever is committed under `website/` is what goes live.

---

## 5. Operational runbook

### One-time: enable GitHub Pages

Pages must be enabled **manually** once before the workflow can succeed:

1. Repo **Settings → Pages**.
2. Set **Source** to **GitHub Actions** (not a branch/`/docs` folder deploy).
3. Save. Subsequent workflow runs can deploy without elevated API access.

### After merging website changes

1. Merge to `main` with paths under `website/**` (or the workflow file).
2. Open **Actions → “Deploy website to GitHub Pages”** and confirm the run succeeds.
3. Open the environment URL from the job summary / `page_url`, or https://garlobrian52.github.io/action/.

### Manual redeploy

Use **Actions → Deploy website to GitHub Pages → Run workflow** (`workflow_dispatch`) when you need a republish without a `website/` path change (e.g. after fixing Pages settings).

### Local preview (before push)

```bash
python3 -m http.server 8080 --directory website
# http://127.0.0.1:8080/
```

---

## 6. Constraints and pitfalls

1. **Path filters** — Editing only `README.md` or `src/` will not trigger deploy. Touch `website/**` or run `workflow_dispatch`.
2. **Project-site base path** — Hosted at `/action/` on `*.github.io`. Current `website/index.html` uses absolute `https://www.tradeweb.com/...` links and inline CSS only, so it works under that base path. If you later add root-relative asset URLs (`/styles.css`), they will break on project Pages—prefer relative paths or keep assets inline.
3. **Artifact root is `website/`** — `index.html` must live at `website/index.html` so it becomes the site root. Nested-only content without a root `index.html` yields a directory listing or 404.
4. **Do not set `enablement: true` on `configure-pages`** — That input asks the action to create/enable a Pages site via the API. The default `GITHUB_TOKEN` cannot do that and fails with `Resource not accessible by integration`. Enable Pages once in **Settings → Pages** instead (PR #5).
5. **Pages not enabled / wrong source** — If configure or deploy fails after a fresh fork/clone, confirm Settings → Pages uses **GitHub Actions** as the source. Org policy can still block Pages entirely.
6. **Cancel in progress** — Rapid successive pushes to `website/` may cancel earlier deploys; the latest run is the source of truth.
7. **Separate from Node CI** — `.github/workflows/ci.yml` does not build or test the static site. Pages failures will not fail `yarn test` / typecheck.

---

## 7. Editing checklist

When changing deploy behavior:

1. Edit `.github/workflows/deploy-pages.yml` and keep path filters aligned with the artifact `path:`.
2. Prefer official `actions/*-pages@v*` majors already pinned unless upgrading intentionally.
3. Do **not** re-add `enablement: true` to `actions/configure-pages` unless you have a token with Pages administration rights and intentionally want API enablement.
4. After changing the workflow, merge to `main` (path filter includes the workflow file) or use `workflow_dispatch` to verify.
5. Spot-check the live URL after deploy, not only the Actions green check.
