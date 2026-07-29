# Tradeweb China Access Channels — static website

This document describes the static page at `website/index.html` (added in PR #3): intent, structure, how to view it, and how to update content safely.

Deploy to GitHub Pages is documented in [`github-pages-deploy.md`](./github-pages-deploy.md) (workflow added in PR #4).

---

## 1. Intent

`website/index.html` is a **self-contained marketing/info page** that summarizes Tradeweb’s China access channels for the onshore bond and derivatives markets. It is **not** part of the Changesets GitHub Action runtime (`src/`, `action.yml`, release workflows).

Use it when you need a local or public, dependency-free preview of the channel timeline and deep links to Tradeweb’s emerging-markets pages.

---

## 2. Architecture

| Aspect | Behavior (verified in source) |
|--------|-------------------------------|
| **Entry** | Single file: `website/index.html` |
| **Dependencies** | None — no JS bundles, no CSS files, no `package.json` scripts |
| **Styling** | Inline `<style>` with CSS variables (`--navy`, `--blue`, `--accent`, `--light`, `--text`) |
| **Layout** | `<header>` → `<main>` (three `<section>`s) → `<footer>` |
| **Interactivity** | CSS-only (card hover); no `<script>` |
| **External content** | All “Learn more” / market links point at `https://www.tradeweb.com/...` with `target="_blank"` and `rel="noopener"` |
| **Hosting** | Published from `website/` by `.github/workflows/deploy-pages.yml` → https://garlobrian52.github.io/action/ |

There is no build step. Opening, serving, or Pages-deploying the HTML file is the full delivery path.

---

## 3. Page structure (codepath → UI)

### Header

- Title: **Tradeweb China Access Channels**
- Tagline: pioneering electronic access to Chinese onshore bond and derivatives markets

### Section: “A History of Firsts”

Narrative plus links to:

- Emerging Markets overview
- Northbound Bond Connect
- CIBM Direct Link
- Southbound Bond Connect (same Bond Connect URL as northbound in source)
- Swap Connect

### Section: “Growing China Access Channels”

Four cards (year badge + title + short blurb + learn-more link):

| Year | Channel | Learn-more path (on tradeweb.com) |
|------|---------|-----------------------------------|
| 2017 | Northbound Bond Connect | `/our-markets/institutional/emerging-markets/bond-connect/` |
| 2020 | CIBM Direct Link | `/our-markets/institutional/emerging-markets/cibm-direct-link/` |
| 2021 | Southbound Bond Connect | `/our-markets/institutional/emerging-markets/bond-connect/` |
| 2023 | Swap Connect | `/our-markets/institutional/emerging-markets/swap-connect/` |

### Section: “Why It Matters”

Bullet list emphasizing liquidity discovery, workflow, transparency, and CNY IRS trading/clearing without changing existing practices.

### Footer

States content is sourced from [Tradeweb Emerging Markets](https://www.tradeweb.com/our-markets/institutional/emerging-markets/) and that the site is **informational only**.

---

## 4. Local usage

From the repo root:

```bash
# Option A — open directly (file://)
xdg-open website/index.html   # Linux
# open website/index.html     # macOS

# Option B — local static server (avoids some file:// quirks)
python3 -m http.server 8080 --directory website
# then visit http://127.0.0.1:8080/
```

No `yarn` / Node install is required for the website itself.

---

## 5. Constraints and pitfalls

1. **Action vs website** — Changes under `website/` do not affect `changesets/action` behavior. Keep action docs (`README.md`, `docs/push-changes-internals.md`) separate unless you are intentionally cross-linking.
2. **Deploy path filter** — Production updates go live only when `website/**` (or the Pages workflow file) lands on `main`, or via manual `workflow_dispatch`. See [`github-pages-deploy.md`](./github-pages-deploy.md).
3. **Link drift** — Channel URLs are hardcoded. If Tradeweb renames paths, update the `href`s in `website/index.html` (history section + each card).
4. **Shared Bond Connect URL** — Northbound and Southbound cards both link to the same Bond Connect page in the current HTML; that matches source, not a docs typo.
5. **Informational disclaimer** — Footer already marks the page as informational only; do not treat copy as product/legal source of truth—prefer tradeweb.com.
6. **Styling edits** — Prefer adjusting CSS variables in `:root` before rewriting layout rules so brand colors stay consistent.
7. **Project Pages base path** — Site is served under `/action/`. Keep assets relative or inline (as today); avoid root-absolute asset URLs.

---

## 6. Editing checklist

When changing the page:

1. Edit only `website/index.html` unless you intentionally add assets.
2. Keep the page self-contained (inline CSS; avoid new runtime deps).
3. Preserve `rel="noopener"` on `target="_blank"` links.
4. Spot-check in a browser at desktop and narrow widths (cards use `repeat(auto-fit, minmax(230px, 1fr))`).
5. Confirm external URLs still resolve on tradeweb.com.
6. After merge to `main`, confirm the Pages workflow run and the live URL.
