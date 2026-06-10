/**
 * coolkit changelog — Generate a CHANGELOG entry from conventional commits.
 *
 * Usage:
 *   coolkit changelog                          # since last tag → stdout
 *   coolkit changelog --from v2.0.0            # from specific tag
 *   coolkit changelog --output CHANGELOG.md    # write to file (overwrite)
 *   coolkit changelog --output CHANGELOG.md --prepend   # insert at top
 */

import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runChangelogWorkflow } from '../src/workflows/changelog.js';

const HELP = `
Usage: coolkit changelog [options]

Generates a CHANGELOG section from conventional commits.
Auto-detects the last git tag as the start of the range.
Non-conventional commits are grouped under "Other Changes".

Options:
  --from <ref>       Start of range (tag or commit hash). Default: last tag.
  --to <ref>         End of range. Default: HEAD.
  --output <file>    Write to file instead of stdout.
  --prepend          When writing to a file, prepend instead of overwrite.
  --debug            Verbose logging.
  -h, --help         Show this help.

Examples:
  coolkit changelog
  coolkit changelog --from v2.1.0 --to v2.2.0
  coolkit changelog --output CHANGELOG.md --prepend
`.trim();

function main(): void {
  const { hasFlag, getFlag } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });

  try {
    runChangelogWorkflow({
      logger,
      options: {
        from: getFlag('--from'),
        to: getFlag('--to'),
        output: getFlag('--output'),
        prepend: hasFlag('--prepend'),
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
}

main();
