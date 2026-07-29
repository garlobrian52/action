# Changesets Release Action

This action for [Changesets](https://github.com/changesets/changesets) creates a pull request with all of the package versions updated and changelogs updated and when there are new changesets on [your configured `baseBranch`](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#basebranch-git-branch-name), the PR will be updated. When you're ready, you can merge the pull request and you can either publish the packages to npm manually or setup the action to do it for you.

## Usage

### Inputs

- github-token - GitHub token used for API calls, PR creation, and git auth. Defaults to the workflow token (`github.token`). An explicit `GITHUB_TOKEN` env var still wins if set (legacy workflows). Most workflows do **not** need `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- publish - The command to use to build and publish packages
- version - The command to update version, edit CHANGELOG, read and delete changesets. Default to `changeset version` if not provided
- commit - The commit message to use. Default to `Version Packages`
- title - The pull request title. Default to `Version Packages`
- setupGitUser - Sets up the git user for commits as `"github-actions[bot]"`. Default to `true`
- createGithubReleases - A boolean value to indicate whether to create Github releases after `publish` or not. Default to `true`
- commitMode - Specifies the commit mode. Use `"git-cli"` to push changes using the Git CLI, or `"github-api"` to push changes via the GitHub API. When using `"github-api"`, all commits and tags are GPG-signed and attributed to the user or app who owns the `GITHUB_TOKEN`. Default to `git-cli`.
- cwd - Changes node's `process.cwd()` if the project is not located on the root. Default to `process.cwd()`
- branch - Branch the action treats as the release base (version PR targets this branch; version branch is `changeset-release/<branch>`). Defaults to the current branch from `github.context.ref` with the `refs/heads/` prefix removed.

### Outputs

- published - A boolean value to indicate whether a publishing has happened or not
- publishedPackages - A JSON array to present the published packages. The format is `[{"name": "@xx/xx", "version": "1.2.0"}, {"name": "@xx/xy", "version": "0.8.9"}]`
- hasChangesets - A boolean about whether there were changesets. Useful if you want to create your own publishing functionality.
- pullRequestNumber - The pull request number that was created or updated

If every remaining changeset has an empty `releases` list, the action logs that all changesets are empty and **does not** open or update a Version Packages PR (`hasChangesets` is still `true`).

### Example workflow:

#### Without Publishing

Create a file at `.github/workflows/release.yml` with the following content.

```yml
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@v1
```

#### With Publishing

You can authenticate to npm with either:

1. **`NPM_TOKEN`** — a classic [npm token](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) that can publish and does not require 2FA on publish ([2FA on auth can still be enabled](https://docs.npmjs.com/about-two-factor-authentication)). Store it as a repo secret named `NPM_TOKEN`.
2. **npm [trusted publishing](https://docs.npmjs.com/trusted-publishers)** (OIDC) — omit `NPM_TOKEN` and grant the job `id-token: write` so GitHub Actions can obtain an OIDC token. The action detects `ACTIONS_ID_TOKEN_REQUEST_TOKEN` / `ACTIONS_ID_TOKEN_REQUEST_URL` and skips writing an auth line to `.npmrc`.

When `NPM_TOKEN` is set, the action writes (or appends) this line to `$HOME/.npmrc` only if no existing npmjs auth line is present:

```
//registry.npmjs.org/:_authToken=<NPM_TOKEN>
```

If a user `.npmrc` already exists **with** an auth token for `registry.npmjs.org`, the action leaves it alone. If `NPM_TOKEN` is unset, the action does **not** write `undefined` into `.npmrc` (required for trusted publishing).

Example with `NPM_TOKEN`:

```yml
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        with:
          # This expects you to have a script called release which does a build for your packages and calls changeset publish
          publish: yarn release
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Send a Slack notification if a publish happens
        if: steps.changesets.outputs.published == 'true'
        # You can do something when a publish happens.
        run: my-slack-bot send-notification --message "A new version of ${GITHUB_REPOSITORY} was published!"
```

Example with trusted publishing (no `NPM_TOKEN`):

```yml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      - run: yarn
      - uses: changesets/action@v1
        with:
          publish: yarn release
```

If you need a custom `.npmrc`, create it in a prior step; the action will not overwrite an existing auth token line for `registry.npmjs.org`:

```yml
- name: Creating .npmrc
  run: |
    cat << EOF > "$HOME/.npmrc"
      //registry.npmjs.org/:_authToken=$NPM_TOKEN
    EOF
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### Custom Publishing

If you want to hook into when publishing should occur but have your own publishing functionality, you can utilize the `hasChangesets` output.

Note that you might need to account for things already being published in your script because a commit without any new changesets can always land on your base branch after a successful publish. In such a case you need to figure out on your own how to skip over the actual publishing logic or handle errors gracefully as most package registries won't allow you to publish over already published version.

```yml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1

      - name: Publish
        if: steps.changesets.outputs.hasChangesets == 'false'
        # You can do something when a publish should happen.
        run: yarn publish
```

#### With version script

If you need to add additional logic to the version command, you can do so by using a version script.

If the version script is present, this action will run that script instead of `changeset version`, so please make sure that your script calls `changeset version` at some point. All the changes made by the script will be included in the PR.

```yml
name: Release

on:
  push:
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install Dependencies
        run: yarn

      - name: Create Release Pull Request
        uses: changesets/action@v1
        with:
          # this expects you to have a npm script called version that runs some logic and then calls `changeset version`.
          version: yarn version
```

#### With Yarn 2 / Plug'n'Play

If you are using [Yarn Plug'n'Play](https://yarnpkg.com/features/pnp), you should use a custom `version` command so that the action can resolve the `changeset` CLI:

```yaml
- uses: changesets/action@v1
  with:
    version: yarn changeset version
    ...
```
