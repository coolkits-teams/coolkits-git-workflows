#!/usr/bin/env node
/**
 * git-tag-delete — Delete a tag both locally and on the remote.
 *
 * Usage:
 *   git-tag-delete v1.2.0
 *   git-tag-delete v1.2.0 --local-only
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runTagDeleteWorkflow } from '../src/workflows/tag-delete.js';

const HELP = `
Usage: git-tag-delete <tag-name> [options]

Deletes a tag locally and on the remote.

Arguments:
  <tag-name>        Tag to delete

Options:
  --local-only      Delete only the local tag
  --remote-only     Delete only the remote tag
  -h, --help        Show this help
`.trim();

const { hasFlag, positionals } = parseCliArgs(process.argv);
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
      runTagDeleteWorkflow({
        config,
        logger,
        options: { tag, localOnly: hasFlag('--local-only'), remoteOnly: hasFlag('--remote-only') },
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
