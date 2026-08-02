# GitHub Pages deploy

This document covers how this fork publishes to GitHub Pages. There are **two** workflows that both target the same Pages site and share the concurrency group `pages`:

| Workflow file | Actions UI name | What it publishes |
|---------------|-----------------|-------------------|
| `.github/workflows/deploy-pages.yml` | Deploy website to GitHub Pages | Static `website/` (Tradeweb China page) |
| `.github/workflows/jekyll-gh-pages.yml` | Deploy Jekyll with GitHub Pages dependencies preinstalled | Jekyll build of the **repo root** (renders `README.md`) |

For Tradeweb page content and local preview, see [`tradeweb-china-website.md`](./tradeweb-china-website.md).

**Live URL:** https://garlobrian52.github.io/action/

As of the Jekyll workflow landing on `main` (`8a8e8f2`), the live site is the Jekyll-rendered README, not `website/index.html`. Re-running `deploy-pages.yml` would flip it back until the next Jekyll run.

**Not related** to the Changesets Action runtime (`src/`, `action.yml`, release/CI workflows).

---

## 1. Intent

- **`deploy-pages.yml`** — ship the dependency-free Tradeweb China Access Channels page without a build step (added in PR #4).
- **`jekyll-gh-pages.yml`** — GitHub’s starter “Jekyll with dependencies preinstalled” template: build the repository root with `actions/jekyll-build-pages` and deploy `_site` (added in `8a8e8f2`). There is no `Gemfile` / `_config.yml` in this repo; Jekyll uses defaults and treats `README.md` as the home page.

Only one deployment is live at a time. Whichever workflow finishes last wins the public URL.

---

## 2. Workflow A — static `website/` (`deploy-pages.yml`)

### Triggers (verified in workflow)

| Trigger | When it runs |
|---------|----------------|
| `push` to `main` | Only if changed paths match `website/**` **or** `.github/workflows/deploy-pages.yml` |
| `workflow_dispatch` | Manual run from the Actions UI (path filter ignored) |

Pushes that only touch Action source (`src/`, tests, etc.) do **not** trigger this workflow (they **do** trigger the Jekyll workflow — see below).

### Permissions, concurrency, environment

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
- **Concurrency group `pages`** — shared with the Jekyll workflow. This workflow sets `cancel-in-progress: true` (cancels an in-flight run in the same group).
- **Environment `github-pages`** — job URL from `steps.deployment.outputs.page_url`.

These permissions are enough to **deploy** an already-enabled Pages site. They are **not** enough to create/enable Pages via the API.

### Deploy pipeline (codepath)

Single job `deploy` on `ubuntu-latest`:

| Step | Action | Role |
|------|--------|------|
| 1 | `actions/checkout@v4` | Check out the triggering commit |
| 2 | `actions/configure-pages@v5` | Read Pages metadata (no `enablement` input → default `false`) |
| 3 | `actions/upload-pages-artifact@v3` with `path: website` | Upload **`website/`** contents as the artifact |
| 4 | `actions/deploy-pages@v4` (`id: deployment`) | Publish; expose `page_url` |

No Node/yarn build. Whatever is committed under `website/` is what goes live when this workflow wins.

### Runbook

**One-time: enable GitHub Pages** (required before either workflow can succeed):

1. Repo **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Save.

**After merging `website/` changes:**

1. Merge to `main` with paths under `website/**` (or the workflow file).
2. Confirm **Actions → “Deploy website to GitHub Pages”** succeeds.
3. If a concurrent Jekyll deploy also ran (any push to `main`), re-check the live URL — Jekyll may have overwritten it. Prefer `workflow_dispatch` on this workflow after Jekyll settles, or disable/remove the Jekyll workflow if `website/` should stay canonical.

**Local preview:**

```bash
python3 -m http.server 8080 --directory website
# http://127.0.0.1:8080/
```

---

## 3. Workflow B — Jekyll repo root (`jekyll-gh-pages.yml`)

### Triggers (verified in workflow)

| Trigger | When it runs |
|---------|----------------|
| `push` to `main` | **Every** push (no path filters) |
| `workflow_dispatch` | Manual run |

### Permissions, concurrency, environment

Same permission trio as Workflow A. Differences:

```yaml
concurrency:
  group: "pages"
  cancel-in-progress: false
```

- Same group name `pages` as `deploy-pages.yml`, so the two workflows serialize against each other.
- **`cancel-in-progress: false`** — an in-flight Jekyll deploy is **not** cancelled by a newer run in the group (unlike Workflow A).
- Split into **`build`** then **`deploy`** (`needs: build`); deploy uses environment `github-pages`.

### Build / deploy pipeline (codepath)

| Job | Step | Action | Role |
|-----|------|--------|------|
| `build` | Checkout | `actions/checkout@v4` | Check out `main` |
| `build` | Setup Pages | `actions/configure-pages@v5` | Pages metadata (`enablement` default `false`) |
| `build` | Build | `actions/jekyll-build-pages@v1` with `source: ./`, `destination: ./_site` | Docker Jekyll build of repo root |
| `build` | Upload | `actions/upload-pages-artifact@v3` | Upload `_site` (default artifact path for this action) |
| `deploy` | Deploy | `actions/deploy-pages@v5` (`id: deployment`) | Publish artifact |

Verified constraints:

- No `Gemfile` or `_config.yml` in the repo; the action’s image supplies the GitHub Pages gem set and default config.
- Home page content comes from root `README.md` (live title: “Changesets Release Action”).
- Styles are served from `/action/assets/css/style.css` (theme assets from the Jekyll build).

### Runbook

1. Ensure Pages source is **GitHub Actions** (same one-time setup as above).
2. Any merge to `main` triggers a build+deploy.
3. Inspect **Actions → “Deploy Jekyll with GitHub Pages dependencies preinstalled”**.
4. Spot-check https://garlobrian52.github.io/action/ — expect README content, not the Tradeweb HTML.

To stop overwriting `website/`, either delete/disable this workflow, or add path filters / remove the deploy job. Keeping both without coordination will keep flipping the public site.

---

## 4. `configure-pages` / `enablement` (verified)

From [`actions/configure-pages@v5` `action.yml`](https://github.com/actions/configure-pages/blob/v5/action.yml):

| Input | Default | Meaning |
|-------|---------|---------|
| `enablement` | `'false'` | When `true`, try to **create/enable** the Pages site via API. Requires a token other than the default `GITHUB_TOKEN` (PAT with `repo` / Pages write, or App with `administration:write` + `pages:write`). |

Implications for this repo:

1. **Omitting `enablement` is already “off”.** Explicit `enablement: false` (as proposed in PR #10) matches the default; it does not change runtime behavior on v5.
2. **`enablement: true` with `GITHUB_TOKEN` fails create.** Observed on the first Pages deploy (PR #4 era):  
   `Create Pages site failed. Error: Resource not accessible by integration`.
3. **With enablement off, missing Pages config fails get.** After PR #5 removed `enablement: true`, the next run logged `enablement: false` and failed with:  
   `Get Pages site failed. … Error: Not Found`  
   until Pages was enabled under **Settings → Pages** with source **GitHub Actions**.
4. Do **not** re-add `enablement: true` unless you intentionally supply a privileged token and want API enablement.

---

## 5. Shared constraints and pitfalls

1. **Two publishers, one URL** — Last successful deploy wins. Jekyll runs on every `main` push; static `website/` only on path matches or manual dispatch.
2. **Shared concurrency group `pages`** — Workflows interact. Differing `cancel-in-progress` settings mean a static deploy can cancel another `pages` run, but Jekyll will not cancel in-flight peers.
3. **Path filters (static only)** — Editing only `README.md` or `src/` does not trigger `deploy-pages.yml`, but **does** trigger Jekyll and can replace the Tradeweb site with README HTML.
4. **Project-site base path** — Hosted at `/action/` on `*.github.io`. Tradeweb `website/index.html` uses absolute Tradeweb.com links and inline CSS. Jekyll assets use `/action/...` paths from the theme.
5. **Artifact root (static)** — For Workflow A, `index.html` must be at `website/index.html`.
6. **No Jekyll project files** — Workflow B is a stock template against a Node action repo. It “works” by rendering markdown; it is not a purposeful docs site layout.
7. **Separate from Node CI** — `.github/workflows/ci.yml` does not build or test either Pages path.
8. **Node 20 deprecation warnings** — Recent runs warn that `configure-pages@v5` / related actions still declare Node 20 while the runner forces Node 24. Cosmetics for now; watch upstream majors.

---

## 6. Editing checklist

When changing Pages behavior:

1. Decide which publisher is canonical (`website/` vs Jekyll README) and disable or path-filter the other.
2. Keep concurrency group names intentional if both remain; document any rename.
3. Prefer official `actions/*-pages@v*` / `jekyll-build-pages@v*` majors already pinned unless upgrading on purpose (`deploy-pages` is `@v4` in Workflow A and `@v5` in Workflow B today).
4. Never set `enablement: true` on `configure-pages` with the default `GITHUB_TOKEN`.
5. After workflow edits, use `workflow_dispatch` or a matching path push, then verify the **live URL** content—not only a green Actions check.
