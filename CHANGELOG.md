# Changelog

All notable changes to `@coolkits/git-workflows` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [2.1.0] — 2026-06-04

### Added

- **`release-uat` workflow** (`coolkit release-uat`) — syncs `root` into the current feature
  branch first, then creates a safe MR branch and opens an MR from the feature branch to
  `uat`. Stops with resolution instructions when conflicts occur. Accepts `--branch`, `--dry-run`.

- **`final-release-sync` workflow** (`coolkit final-release-sync`) — after UAT testing passes,
  syncs `uat` back into `root`. Creates a temporary MR branch off `root`, merges `uat` into
  it locally, and opens an MR into `root`. On conflict, prints a 4-step resolution guide
  (git-level fix → conflict-marker scan → **mandatory `tsc --noEmit`** → commit/push) with
  per-status commands (`UU`, `AA`, `UA`, `AU`, `DD`, `UD`, `DU`). Accepts `--dry-run`.

  > **`tsc` step is mandatory.** `--ours` on `UU`/`AA` files silently drops UAT additions
  > (new exports, types, props) that are the purpose of the sync. `tsc` is the only
  > automatic detector for this class of silent code loss.

- **`rebuild-clean-branch` workflow** (`coolkit rebuild-clean-branch`) — creates a clean
  branch by squashing the diff between a contaminated source branch and a clean base into a
  single commit. Useful when a branch has accumulated bad merges or unrelated code.

- **`src/core/feature-scope.ts`** — new internal module used by `sync-from-main`:
  - `detectOwnedFeatureDirs` — derives which `src/features/<x>` directories a branch
    genuinely owns by inspecting first-parent non-merge commits since the merge-base.
    Excludes code that arrived via earlier sync merges from `main`/`root`.
  - `classifyConflictFile` — classifies a conflicted path as `'mine'`, `'other'`, or
    `'shared'` relative to the detected owned dirs and `config.featurePath`.
  - `listConflictedFiles` — reads `git status --porcelain` and returns all unmerged paths
    (handles all status codes: `UU`, `AA`, `AU`, `UA`, `DD`, `UD`, `DU`).
  - `takeRootVersion` — resolves a conflicted file by taking the root/incoming tree object
    directly (`git checkout MERGE_HEAD -- <file>`) instead of `--theirs`, which is robust
    against rename conflicts that `--theirs` fails on.

### Changed

- **`sync-from-main` smart conflict resolution** — when `root` is merged into a feature
  branch and conflicts arise, the workflow now classifies each conflicted file:
  - **OTHER features** (`src/features/<not-mine>/**`) → automatically resolved to root
    (staged, not committed). Root is the source of truth; feature branches must adapt.
  - **Own feature** (owned dirs detected from first-parent commits) → left untouched for
    the developer to resolve manually.
  - **Shared/common** (outside `featurePath`) → left untouched for manual resolution.

  After auto-resolution, the workflow prints a clear next-steps list (resolve remaining →
  `tsc --noEmit` → `git commit` → `git push`) and does **not** push automatically.
  If zero owned dirs are detected or `--manual` is passed, all conflicts are left manual.

- **`sync-from-main` new flags:**
  - `--feature <branch>` — target feature branch (alias for the existing `--branch`).
  - `--manual` — opt-out of smart resolution; leave every conflict for manual fixing.

- **`SyncOptions`** — new optional fields `feature` and `manual`.
- **`SyncResult`** — new statuses `'partial'` and `'manual'`; new fields `autoResolved`
  and `manualFiles`.

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

[2.1.0]: https://github.com/coolkits-teams/coolkits-git-workflows/compare/v2.0.0...v2.1.0
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
