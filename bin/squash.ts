/**
 * git-squash — Combine the last N commits into one clean commit.
 *
 * Usage:
 *   git-squash --count 3
 *   git-squash --count 3 --message "feat: complete user auth flow"
 *   git-squash --count 3 --force    # squash + force-push
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runSquashWorkflow } from '../src/workflows/squash.js';

const HELP = `
Usage: git-squash --count <N> [options]

Combines the last N commits into a single commit.
Only works on unpushed commits (or with --force).

Options:
  --count <N>       Number of commits to squash (required, minimum 2)
  --message <msg>   Combined commit message (default: joined from squashed subjects)
  --force           Force-push after squash
  -h, --help        Show this help
`.trim();

const { hasFlag, getFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const rawCount = getFlag('--count');
if (!rawCount) {
  process.stderr.write('Error: --count is required.\n\n' + HELP + '\n');
  process.exit(1);
}
const count = parseInt(rawCount, 10);
if (isNaN(count)) {
  process.stderr.write('Error: --count must be a number.\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runSquashWorkflow({
        config,
        logger,
        options: { count, message: getFlag('--message'), force: hasFlag('--force') },
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
