import { defineConfig } from 'tsup';

export default defineConfig([
  // Public programmatic API — emits types for library consumers
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: { resolve: false },
    clean: true,
    minify: true,
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    sourcemap: false,
  },
  // CLI entry points — standalone bundles, no types needed
  {
    entry: {
      'bin/coolkit': 'bin/coolkit.ts',
      // ── Architecture workflows ──────────────────────────────────────────
      'bin/extract-common': 'bin/extract-common.ts',
      'bin/sync-from-root': 'bin/sync-from-root.ts',
      'bin/create-mr': 'bin/create-mr.ts',
      'bin/start-branch': 'bin/start-branch.ts',
      'bin/finish-branch': 'bin/finish-branch.ts',
      // ── Git utilities ───────────────────────────────────────────────────
      'bin/undo': 'bin/undo.ts',
      'bin/revert-commit': 'bin/revert-commit.ts',
      'bin/amend': 'bin/amend.ts',
      'bin/squash': 'bin/squash.ts',
      'bin/move-commits': 'bin/move-commits.ts',
      'bin/cherry-pick': 'bin/cherry-pick.ts',
      'bin/delete-branch': 'bin/delete-branch.ts',
      'bin/recover-branch': 'bin/recover-branch.ts',
      'bin/prune-branches': 'bin/prune-branches.ts',
      'bin/abort': 'bin/abort.ts',
      'bin/resolve': 'bin/resolve.ts',
      'bin/pull-rebase': 'bin/pull-rebase.ts',
      'bin/purge-file': 'bin/purge-file.ts',
      'bin/search-commits': 'bin/search-commits.ts',
      'bin/bisect': 'bin/bisect.ts',
      'bin/tag-create': 'bin/tag-create.ts',
      'bin/tag-delete': 'bin/tag-delete.ts',
      // ── Release workflows ───────────────────────────────────────────────
      'bin/release-uat': 'bin/release-uat.ts',
      'bin/final-release-sync': 'bin/final-release-sync.ts',
      'bin/clean-local': 'bin/clean-local.ts',
      'bin/rebuild-clean-branch': 'bin/rebuild-clean-branch.ts',
      // ── Dev utilities ───────────────────────────────────────────────────
      'bin/wip': 'bin/wip.ts',
      'bin/rename-branch': 'bin/rename-branch.ts',
      'bin/branch-status': 'bin/branch-status.ts',
      'bin/commit': 'bin/commit.ts',
      'bin/changelog': 'bin/changelog.ts',
      'bin/open-mr': 'bin/open-mr.ts',
    },
    format: ['esm'],
    dts: false,
    clean: false,
    minify: true,
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
