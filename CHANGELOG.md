# Changelog

All notable changes to `@coolkits/git-workflows` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [2.0.0] — 2026-05-27

### Breaking

- Removed `rootBranch` config. Common extract and sync use `mainBranch` only (default `main`).
  Legacy configs with `rootBranch` are migrated automatically on load.
- Renamed `extractCommonRootMergeFormat` → `extractCommonMainMergeFormat`; template placeholder
  `{rootBranch}` → `{mainBranch}`.
- `protectedBranches` defaults no longer include a `root` branch name.

### Added

- **`env-flow` architecture preset** — main / dev / qa / uat promotion with `feature`,
  `fixbug`, `hotfix`, and `common` branches; `config-examples/env-flow.json`.
- **`coolkit` CLI** — single entry point (`coolkit <command>`) for all workflows and utilities.
- **Configurable message templates** — `createMrTitleFormat`, `extractCommonMrTitleFormat`,
  `extractCommonCommitSubjectFormat`, `extractCommonMainMergeFormat`, and related fields
  with `{placeholder}` substitution.
- **Configurable branch name templates** — `commonBranchFormat`, `mrBranchFormat`,
  `featureBranchFormat`, `fixbugBranchFormat`, `syncBackupTagFormat`, and related fields.
- **Conventional Commits & semver hints** — `commitMessageFormat`, `commitTypeByBranchPrefix`,
  `mrTargetByBranchPrefix`, `baseBranchByBranchType`, `semverBumpByCommitType`.
- **`fixbug` branch type** — `start-branch --type fixbug`, `fixbugBranchPrefix`, env-flow MR
  routing to `qa`.
- **`extract-common` flags** — `--desc`, `--ticket`, `--scope`, `--type` for slug and commit
  message customization.

### Changed

- CLI: prefer `coolkit sync-from-main`; `sync-from-root` remains as a deprecated alias.

[2.0.0]: https://github.com/coolkits-teams/coolkits-git-workflows/releases/tag/v2.0.0

---

## [1.2.0] — 2026-05-26

### Added

- **Multi-architecture support** — new `architecture` preset field in config.
  Six presets ship out of the box:
  `feature-based` (default), `gitflow`, `github-flow`, `gitlab-flow`,
  `trunk-based`, `monorepo`.  
  Each preset defines sensible branch-role defaults; individual fields in
  `git-controls.config.json` always override the preset.

- **`git-create-mr`** — create a merge request / pull request from any branch
  into any branch. Options:
  - `--source` / `--target` (defaults: current branch → architecture-aware target)
  - `--title` custom MR title
  - `--checkout` create a dedicated `mr/<slug>-<ts>` branch before pushing,
    keeping the source branch untouched
  - `--base source|target` controls what the checkout branch is based on
  - `--no-push` / `--dry-run`

- **`git-start-branch`** — create a new branch following the current
  architecture's conventions (prefix, base branch). Supports branch types:
  `feature`, `release`, `hotfix`, `fix`, `chore`. Pushes immediately and
  prints suggested next steps.

- **`git-finish-branch`** — push the current branch and open an MR/PR into
  the architecture-correct target. For gitflow `release/*` and `hotfix/*`
  branches it sets `main` as the primary target and reminds you to also
  open a second MR into `develop`.

- **GitHub provider** — `mergeRequestProvider: "github"` now uses the `gh`
  CLI to create pull requests (previously only `gitlab` was supported).

- **`createMrProvider` factory** — unified provider factory that picks
  `gitlab-provider`, `github-provider`, or a URL-only fallback based on
  `mergeRequestProvider` config.

### Changed

- `MergeRequestParams` now includes a required `targetBranch` field.
  Existing workflows (`extract-common`) pass `config.rootBranch` explicitly.
- `GitLabProvider` and `GitHubProvider` use the dynamic `targetBranch` from
  params instead of the hardcoded `config.rootBranch`.
- Config merge order: **base defaults → architecture preset → user overrides**.
  Setting `"architecture": "gitflow"` gives you gitflow branch defaults
  without repeating every field.
- Bumped to `1.2.0` (minor: new backward-compatible features).

---

## [1.1.2] — 2026-05-26

### Fixed

- `git-sync-from-root`: handle `null` stdout/stderr when git commands use
  `stdio: 'inherit'` (merge/push) — fixes crash after a successful merge.

[1.1.2]: https://github.com/coolkits-teams/coolkits-git-workflows/releases/tag/v1.1.2

---

## [1.1.1] — 2026-05-26

### Fixed

- `git-extract-common`: preserve trailing newline in patch output — fixes
  `corrupt patch` errors when applying extracted diffs on Windows.

### Changed

- Common branch names now keep the full feature branch slug
  (e.g. `common/feature-example-202605260220` instead of `common/example-...`).
- Extract commit, MR title, and MR description prominently include the source
  feature branch and suggest a merge commit message for merging into `root`.

[1.1.1]: https://github.com/coolkits-teams/coolkits-git-workflows/releases/tag/v1.1.1

---

## [1.1.0] — 2026-05-26

### Added

- `commonExcludePaths` config: exclude **directories** (and all nested files) from
  common extract — e.g. submodules, vendored tooling (`service-worker-api`,
  `packages/git-workflows`).
- `commonExcludeFiles` config: exclude **individual files** from common extract
  — e.g. generated artifacts (`public/version.json`).
- `buildCommonPathspec`, `directoryExcludePathspec`, `fileExcludePathspec`,
  `normalizePathList`, and `normalizeRepoPath` exported from the public API.
- Unit tests for pathspec building (`npm run test`).

### Changed

- `git-extract-common` diff scope now merges `featurePath`, `commonExcludePaths`,
  and `commonExcludeFiles` into a single git pathspec.

[1.1.0]: https://github.com/coolkits-teams/coolkits-git-workflows/releases/tag/v1.1.0

---

## [1.0.0] — 2026-05-25

### Added

- `git-extract-common` CLI: extracts changes outside `featurePath` from a feature
  branch, creates a dedicated `common/<slug>-<timestamp>` branch from the
  integration branch, applies the diff as a patch, pushes, and opens a merge
  request via `glab` or prints a fallback URL.
- `git-sync-from-root` CLI: merges the integration branch into the current
  feature branch, creates a rollback backup tag, and pushes.
- Project-level configuration via `git-controls.config.json` (or `.js`/`.mjs`).
- `--dry-run` flag on `extract-common` for safe previews.
- `--no-mr` flag to push without opening a merge request.
- `--no-push` flag on `sync-from-root` for local-only merges.
- `--branch <name>` flag on both commands (defaults to the current branch).
- `--debug` flag for verbose output.
- `--help` / `-h` flag for usage information.
- Public JavaScript API: `runExtractCommonWorkflow`, `runSyncFromRootWorkflow`,
  `loadConfig`, `createLogger`, `createGitClient`, `createBranchResolver`,
  `createWorkingTreeInspector`, `createGitLabProvider`, `parseCliArgs`.
- Automatic backup tag before every sync operation.
- Worktree-based patch application to avoid touching the working directory.
- Conflict detection with actionable resolution guidance.
- Zero runtime dependencies.

[1.0.0]: https://github.com/coolkits-teams/coolkits-git-workflows/releases/tag/v1.0.0
