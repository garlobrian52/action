# GitHub Pages deploy — `website/` → Pages

This document describes how `.github/workflows/deploy-pages.yml` publishes the static site under `website/` to GitHub Pages (added in PR #4).

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

---

## 4. Deploy pipeline (codepath)

Single job `deploy` on `ubuntu-latest`:

| Step | Action | Role |
|------|--------|------|
| 1 | `actions/checkout@v4` | Check out the commit that triggered the workflow |
| 2 | `actions/configure-pages@v5` with `enablement: true` | Configure Pages; **auto-enable** Pages on the repo on first successful configure (no manual Settings → Pages click required for enablement) |
| 3 | `actions/upload-pages-artifact@v3` with `path: website` | Upload the **`website/` directory contents** as the Pages artifact (not the whole repo) |
| 4 | `actions/deploy-pages@v4` (`id: deployment`) | Publish the artifact; expose `page_url` |

There is **no build step** (no Node/yarn). Whatever is committed under `website/` is what goes live.

---

## 5. Operational runbook

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
4. **`enablement: true`** — First run should turn Pages on. If deploy still fails with Pages-disabled errors, check repo **Settings → Pages** and org policy; the workflow cannot override org blocks.
5. **Cancel in progress** — Rapid successive pushes to `website/` may cancel earlier deploys; the latest run is the source of truth.
6. **Separate from Node CI** — `.github/workflows/ci.yml` does not build or test the static site. Pages failures will not fail `yarn test` / typecheck.

---

## 7. Editing checklist

When changing deploy behavior:

1. Edit `.github/workflows/deploy-pages.yml` and keep path filters aligned with the artifact `path:`.
2. Prefer official `actions/*-pages@v*` majors already pinned unless upgrading intentionally.
3. After changing the workflow, merge to `main` (path filter includes the workflow file) or use `workflow_dispatch` to verify.
4. Spot-check the live URL after deploy, not only the Actions green check.
