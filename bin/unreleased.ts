/**
 * coolkit unreleased — List commits on source not yet present on target.
 *
 * Usage:
 *   coolkit unreleased
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

Default mode treats a commit as already released when:
  1) an equivalent patch-id exists on target, or
  2) reversing the commit's patch against the target tip succeeds, or
  3) exactly one target commit shares the same subject (cherry-pick with conflict).

Those are listed as [ported] so they are not picked again.
Duplicate subjects on target are listed as [ambiguous].

Options:
  --source <ref>     Branch/ref that may have new commits (default: qaBranch from config)
  --target <ref>     Branch/ref already released to (default: preUatBranch or uatBranch)
  --author <email>   Filter by author email (substring match)
  --fast             Skip equivalence checks; list commits by hash only
  --debug            Verbose logging
  -h, --help         Show this help

Examples:
  coolkit unreleased
  coolkit unreleased --source=origin/qa --target=origin/pre-uat
  coolkit unreleased --author=hung.ngo-van@banvien.com.vn
  coolkit unreleased --source=qa --target=pre-uat --fast
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
