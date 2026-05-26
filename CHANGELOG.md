# Changelog

All notable changes to `@coolkits/git-workflows` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
