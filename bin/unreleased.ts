/**
 * coolkit unreleased — List commits on source not yet present on target.
 *
 * Usage:
 *   coolkit unreleased
 *   coolkit unreleased --careful
 *   coolkit unreleased --source=qa --target=pre-uat
 *   coolkit unreleased --no-fetch
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runUnreleasedWorkflow } from '../src/workflows/unreleased.js';

const HELP = `
Usage: coolkit unreleased [options]

List commits on --source that are not yet present on --target.

Always compares remote refs (origin/<branch> by default).
Before comparing, fetches both source and target from the remote so
stale local branches cannot skew the result. Use --no-fetch to skip.

Defaults (no options):
  --source   origin/<current branch>
  --target   origin/<preUatBranch> (or uatBranch)
  --author   your git user.email

By default only unreleased (safe to pick) commits are listed.
Noisy commits (already on target, empty, ported, ambiguous) are counted
but hidden. Use --careful to list them with do-not-pick warnings.

Options:
  --source <ref>     Candidate branch/ref. Default: current branch → origin/<branch>.
  --target <ref>     Released-to branch/ref. Default: preUatBranch → origin/<branch>.
  --author <email>   Filter by author email (substring). Default: git user.email.
  --all-authors      Include commits from all authors (no author filter).
  --careful          Also list noisy commits with do-not-pick warnings.
  --fast             Skip equivalence checks; list by hash only.
  --no-fetch         Skip git fetch (use existing remote-tracking refs).
  --debug            Verbose logging.
  -h, --help         Show this help.

Examples:
  coolkit unreleased
  coolkit unreleased --careful
  coolkit unreleased --source=qa --target=pre-uat
  coolkit unreleased --all-authors --careful
`.trim();

function main(): void {
  const { hasFlag, getFlag } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });

  loadConfig()
    .then((config) => {
      try {
        runUnreleasedWorkflow({
          config,
          logger,
          options: {
            source: getFlag('--source'),
            target: getFlag('--target'),
            author: getFlag('--author'),
            allAuthors: hasFlag('--all-authors'),
            careful: hasFlag('--careful'),
            fast: hasFlag('--fast'),
            noFetch: hasFlag('--no-fetch'),
          },
        });
      } catch (error) {
        if (error instanceof GitControlsError) {
          logger.err(error.message);
          error.details?.forEach((d) => {
            logger.err(`  ${d}`);
          });
        } else {
          logger.err(error instanceof Error ? error.message : String(error));
        }
        process.exit(1);
      }
    })
    .catch((error: unknown) => {
      process.stderr.write(String(error) + '\n');
      process.exit(1);
    });
}

main();
