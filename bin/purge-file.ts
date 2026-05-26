#!/usr/bin/env node
/**
 * git-purge-file — Permanently remove a file from the entire git history.
 * Use when you accidentally committed secrets, credentials, or large binaries.
 *
 * ⚠️  DESTRUCTIVE — rewrites all commits. Force-push required after.
 *
 * Usage:
 *   git-purge-file .env --dry-run   # preview first!
 *   git-purge-file .env
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runPurgeFileWorkflow } from '../src/workflows/purge-file.js';

const HELP = `
Usage: git-purge-file <file-path> [options]

⚠️  DESTRUCTIVE — permanently removes a file from ALL git history.
Always run with --dry-run first to see what will be affected.

Arguments:
  <file-path>     Path to the file to remove from history (relative to repo root)

Options:
  --dry-run       Preview affected commits without making changes
  --skip-backup   Skip creating a backup tag (not recommended)
  -h, --help      Show this help

After running:
  1. Force-push all branches: git push origin --force --all
  2. Notify all collaborators to re-clone
  3. If a secret was exposed: ROTATE IT IMMEDIATELY
`.trim();

const { hasFlag, positionals } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const file = positionals[0];
if (!file) {
  process.stderr.write('Error: file path is required.\n\n' + HELP + '\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runPurgeFileWorkflow({
        config,
        logger,
        options: { file, dryRun: hasFlag('--dry-run'), skipBackup: hasFlag('--skip-backup') },
      });
    } catch (e) {
      if (e instanceof GitControlsError) {
        logger.err(e.message);
        e.details?.forEach((d) => {
          logger.err(`  ${d}`);
        });
      } else logger.err(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  })
  .catch((e: unknown) => {
    process.stderr.write(String(e) + '\n');
    process.exit(1);
  });
