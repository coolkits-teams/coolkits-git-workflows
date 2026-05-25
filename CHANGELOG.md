# Changelog

All notable changes to `@coolkits/git-workflows` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/coolkits/git-workflows/releases/tag/v1.0.0
