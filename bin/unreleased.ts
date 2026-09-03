/**
 * coolkit unreleased — List commits on source not yet present on target.
 *
 * Usage:
 *   coolkit unreleased
 *   coolkit unreleased --careful
 *   coolkit unreleased --source=origin/qa --target=origin/pre-uat
 *   coolkit unreleased --author=hung.ngo-van@banvien.com.vn
 *   coolkit unreleased --fast
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runUnreleasedWorkflow } from '../src/workflows/unreleased.js';

const HELP = `
Usage: coolkit unreleased [options]

List commits on --source that are not yet present on --target.

Defaults (no options):
  --source   current branch
  --target   preUatBranch from config (or uatBranch)
  --author   your git user.email

By default only unreleased (safe to pick) commits are listed.
Noisy commits (already on target, empty, ported, ambiguous) are counted
but hidden. Use --careful to list them with do-not-pick warnings.

Equivalence checks (unless --fast):
  1) same patch-id on target → already released
  2) reverse-apply succeeds on target tree → already released
  3) one target commit shares title → ported (conflict resolve, do not re-pick)
  4) multiple target commits share title → ambiguous

Options:
  --source <ref>     Branch with candidate commits. Default: current branch.
  --target <ref>     Branch already released to. Default: preUatBranch / uatBranch.
  --author <email>   Filter by author email (substring). Default: git user.email.
  --all-authors      Include commits from all authors (no author filter).
  --careful          Also list noisy commits with do-not-pick warnings.
  --fast             Skip equivalence checks; list by hash only.
  --debug            Verbose logging.
  -h, --help         Show this help.

Examples:
  coolkit unreleased
  coolkit unreleased --careful
  coolkit unreleased --source=origin/qa --target=origin/pre-uat
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
