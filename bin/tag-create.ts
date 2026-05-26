/**
 * git-tag-create — Create an annotated tag and push it to origin.
 *
 * Usage:
 *   git-tag-create v1.2.0
 *   git-tag-create v1.2.0 --message "Stable release with auth module"
 *   git-tag-create v1.2.0 --commit abc1234
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runTagCreateWorkflow } from '../src/workflows/tag-create.js';

const HELP = `
Usage: git-tag-create <tag-name> [options]

Creates an annotated tag (with metadata: author, date, message) and pushes to remote.
Annotated tags are the recommended type for releases — use them over lightweight tags.

Arguments:
  <tag-name>          Tag name (e.g. v1.2.0)

Options:
  --message <msg>     Tag annotation message (default: "Release <tag-name>")
  --commit <hash>     Commit to tag (default: HEAD)
  --no-push           Create locally only
  -h, --help          Show this help
`.trim();

const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const tag = positionals[0];
if (!tag) {
  process.stderr.write('Error: tag name is required.\n\n' + HELP + '\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runTagCreateWorkflow({
        config,
        logger,
        options: {
          tag,
          message: getFlag('--message'),
          commit: getFlag('--commit'),
          skipPush: hasFlag('--no-push'),
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
  })
  .catch((e: unknown) => {
    process.stderr.write(String(e) + '\n');
    process.exit(1);
  });
