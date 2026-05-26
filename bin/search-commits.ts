#!/usr/bin/env node
/**
 * git-search-commits — Find commits by message text or code changes.
 *
 * Usage:
 *   git-search-commits --message "fix login"
 *   git-search-commits --content "API_SECRET"
 *   git-search-commits --content "getUserById" --limit 50
 */
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runSearchCommitsWorkflow } from '../src/workflows/search-commits.js';

const HELP = `
Usage: git-search-commits [options]

Search through git history for commits matching a message or content change.

Options:
  --message <text>    Search commit messages (case-insensitive grep)
  --content <text>    Search commits that added/removed the given string in code
                      (uses git log -S — powerful for tracking secret exposure)
  --limit <N>         Max results to show (default: 20)
  --no-all            Search only current branch (default: all branches)
  -h, --help          Show this help

Examples:
  git-search-commits --message "refactor"
  git-search-commits --content "password123"
  git-search-commits --message "feat:" --limit 50
`.trim();

const { hasFlag, getFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const rawLimit = getFlag('--limit');
const limit = rawLimit ? parseInt(rawLimit, 10) : 20;

const logger = createLogger({ debug: hasFlag('--debug') });

try {
  runSearchCommitsWorkflow({
    logger,
    options: {
      message: getFlag('--message'),
      content: getFlag('--content'),
      limit,
      all: !hasFlag('--no-all'),
    },
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
