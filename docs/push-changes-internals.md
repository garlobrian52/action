# `pushChanges` Internals — git-cli vs github-api paths

This document explains how `pushChanges` in `src/git.ts` decides whether to commit and how each commit path (git-cli and github-api) works.

For when `runVersion` lists existing PRs before calling `pushChanges`, and how the Version Packages PR body is built, see [`action-runtime.md`](./action-runtime.md).

---

## 1. `pushChanges` — git-cli path (`src/git.ts` lines 103–128)

```typescript
async pushChanges({ branch, message }: { branch: string; message: string }) {
  if (this.octokit) { /* ...github-api path... */ }

  if (!(await checkIfClean({ cwd: this.cwd }))) {
    await commitAll(message, { cwd: this.cwd });
  }
  await push(branch, { cwd: this.cwd });
}
```

### Decision logic

1. **`checkIfClean` (lines 40–47)** — runs `git status --porcelain` in `cwd`. If stdout is empty (zero-length string), returns `true` (clean). If there's any output (modified/untracked files), returns `false` (dirty).

2. **Conditional commit** — `pushChanges` only calls `commitAll` when the tree is _not_ clean (`!isClean`). This avoids a `git commit` error when there's nothing to stage.

3. **`commitAll` (lines 35–38)** — runs `git add .` followed by `git commit -m <message>` in `cwd`. This stages all changes (new/modified/deleted) and creates a local commit.

4. **Always pushes** — regardless of whether a new commit was created, `push(branch, { cwd })` (lines 11–13) runs:
   ```
   git push origin HEAD:<branch> --force
   ```
   This force-pushes the current HEAD to the remote branch. The force-push is safe here because `prepareBranch` (lines 94–101) has already reset the local branch to `github.context.sha`, so the only commit on the branch is the one just created.

---

## 2. `pushChanges` — github-api path via `@changesets/ghcommit` (lines 103–123)

When `this.octokit` is set (i.e., `commitMode === "github-api"` in `src/index.ts` lines 30–33), the method returns early via:

```typescript
return commitChangesFromRepo({
  octokit: this.octokit,
  ...github.context.repo,   // { owner, repo }
  branch,
  message,
  base: { commit: github.context.sha },
  cwd: this.cwd,
  force: true,
});
```

The comment at line 105–110 explains that `cwd` restricts which files are included, emulating `git add .` scoped to that directory.

### What `commitChangesFromRepo` does (`@changesets/ghcommit@2.0.1`)

The implementation uses [`isomorphic-git`](https://www.npmjs.com/package/isomorphic-git) to diff the working tree against the base commit entirely on disk, then calls the GitHub GraphQL API to create the commit server-side.

#### Step 1 — Resolve base OID

```js
const ref = base?.commit ?? "HEAD";  // here: github.context.sha
const oid = (await git.log({ fs, dir: repoRoot, ref, depth: 1 }))[0].oid;
```

Uses `isomorphic-git` to read the local `.git` directory and resolve the provided commit SHA to its OID.

#### Step 2 — Walk & diff the tree

```js
const trees = [git.TREE({ ref: oid }), git.WORKDIR()];
await git.walk({ fs, dir: repoRoot, trees, map: async (filepath, [commit, workdir]) => { ... }});
```

Compares the committed tree (`TREE` at `oid`) against the working directory (`WORKDIR`). For each file:

- Skips `.gitignore`'d files.
- Skips unchanged files (`prevOid === currentOid`) **before** symlink/executable checks — so already-committed symlinks and executables that stay untouched do **not** fail the walk (`@changesets/ghcommit@2.0.1`, action #563).
- Throws if a **changed** path is a symlink (committed or working tree), or if the working-tree mode is executable — GitHub's `createCommitOnBranch` API still cannot add/update those file types. Use `commitMode: git-cli` (default) when the version commit must touch them.
- **Scopes to `cwd`** after those checks: if `cwd` differs from repo root, files whose path doesn't start with `relative(repoRoot, cwd) + "/"` are excluded. This is the `git add .` emulation (note: a changed symlink/executable outside `cwd` can still throw before this filter).
- Deleted files → `deletions[]`; added/modified files → reads their content via `workdir.content()` into `additions[]` as Buffers.

#### Step 3 — Create commit via GitHub GraphQL API

Calls `commitFilesFromBuffers` → `commitFilesFromBase64`, which:

1. **Base64-encodes** all file contents.
2. Calls `getRepositoryMetadata` (GraphQL query) to look up the repository ID, base ref OID, and target branch state.
3. **Branch management:**
   - If target branch doesn't exist → `createRefMutation` (creates `refs/heads/<branch>` pointing at `baseOid`).
   - If target branch exists but doesn't match `baseOid` AND `force: true` → `updateRefMutation` (force-updates branch to `baseOid`).
   - If target branch already matches `baseOid` → uses existing ref ID.
4. **Creates commit:** calls the `createCommitOnBranch` GraphQL mutation with:
   ```graphql
   mutation createCommitOnBranch($input: CreateCommitOnBranchInput!) {
     createCommitOnBranch(input: $input) { ref { id } }
   }
   ```
   Passing `branch: { id: refId }`, `expectedHeadOid: baseOid`, `message: { headline, body }`, and `fileChanges: { additions, deletions }`.

This is GitHub's official [Commits API](https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch) — the commit is created entirely server-side.

---

## 3. Contrast between the two paths

| Aspect | git-cli path | github-api path |
|--------|-------------|-----------------|
| **Mechanism** | Local `git` binary via `@actions/exec` | GitHub GraphQL API (`createCommitOnBranch` mutation) via `@changesets/ghcommit` |
| **Attribution** | `github-actions[bot]` only if `setupGitUser` input is `true` (invokes `setupUser`, `src/git.ts` lines 58–76); otherwise uses the runner's existing git identity | Attributed to the `GITHUB_TOKEN` owner (the user or app that owns the token) |
| **Signing** | Unsigned (unless runner is configured for GPG signing externally) | **GPG-signed by GitHub** automatically (server-side commits are always signed) |
| **`setupUser`** | Configures `user.name`/`user.email` for git commits | **No-op** — returns immediately when `this.octokit` is set (line 59–61) |
| **`prepareBranch`** | Checks out (or creates) branch locally, then `git reset --hard` to `github.context.sha` | **No-op** — returns immediately (lines 95–98); branch creation/update is handled server-side by the API |
| **Dirty-check** | Explicit: runs `git status --porcelain`; skips commit if clean | Implicit: `isomorphic-git.walk` diffs working tree vs base; if no changes detected, `fileChanges` will be empty |
| **Push method** | `git push origin HEAD:<branch> --force` | `updateRefMutation` with `force: true` (if branch diverged from base), then `createCommitOnBranch` which advances the ref |
| **File scoping** | `git add .` stages everything in `cwd` and below | `isomorphic-git` walk filtered to paths starting with `relative(repoRoot, cwd)` |
| **Limitations** | None for standard files | Unchanged committed symlinks/executables are OK; **changing** them still fails (GitHub API limitation) — use `git-cli` |

---

## 4. Call sites in `src/run.ts`

- **`pushChanges`** is called during `runVersion` to push the version-bump commit to the PR branch (`changeset-release/<branch>`).
- **Existing PR fetch before push** — `runVersion` lists open PRs for `head: owner:changeset-release/<branch>` **before** `pushChanges`. With `commitMode: github-api`, `@changesets/ghcommit` may reset the remote branch to the base SHA (which would otherwise close the PR); keeping the PR number and calling `pulls.update` with `state: "open"` reopens/updates it (#488). Full version-PR lifecycle: [`action-runtime.md`](./action-runtime.md) §5.

---

## 5. `pushTag` — publish-time tags (`src/git.ts`)

Called from `runPublish` **only when** `createGithubReleases` is `true` (default). Setting `createGithubReleases: false` skips **both** tag creation/push by the action **and** `repos.createRelease`.

| Mode | Behavior |
|------|----------|
| **git-cli** | `git push origin <tag>` in `cwd`. Expects the publish script (e.g. `changeset publish` / `changeset tag`) to have created the local tag already. |
| **github-api** | `octokit.rest.git.createRef({ ref: "refs/tags/<tag>", sha: github.context.sha })`. The tag always points at the **workflow triggering commit** (`github.context.sha`), not at a commit the publish script may have created afterward. |

### Tag name conventions (chosen in `runPublish`, not in `pushTag`)

| Package layout (`@manypkg/get-packages` `tool`) | Tag name |
|------------------------------------------------|----------|
| Non-root (monorepo) | `{packageName}@{version}` |
| Root | `v{version}` |

### Pitfalls

1. **`createGithubReleases: false` disables action tag pushes** — if you rely on the action (not your script) to publish tags, leave it `true` or push tags in `publish`.
2. **github-api tags `github.context.sha`** — correct when publish does not create a new git commit; wrong if your publish script commits first and you expected the tag on that new commit.
3. **createRef failures are warnings** — `.catch` logs `Failed to create tag …` and continues (assumes a custom publish script already pushed the tag). `createRelease` still runs afterward.
4. **git-cli missing local tag** — `git push origin <tag>` fails the step if the tag was never created locally.
