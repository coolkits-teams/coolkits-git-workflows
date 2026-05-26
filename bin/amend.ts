#!/usr/bin/env node
/**
 * git-amend — Fix the last commit: change message, add forgotten files, or remove files.
 *
 * Usage:
 *   git-amend --message "fix: correct typo in API call"
 *   git-amend --add src/foo.ts
 *   git-amend --remove .env
 *   git-amend --message "new msg" --force    # amend + force-push
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runAmendWorkflow } from '../src/workflows/amend.js';

const HELP = `
Usage: git-amend [options]

Modifies the last commit. Options may be combined.

Options:
  --message <msg>   New commit message
  --add <file>      Add a file to the last commit (may repeat)
  --remove <file>   Remove a file from the last commit (keeps file locally)
  --force           Force-push after amend (warns collaborators)
  -h, --help        Show this help
`.trim();

const { hasFlag, getFlag, args } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

// Collect multiple --add and --remove values
const collectMulti = (flag: string): string[] => {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === flag && next && !next.startsWith('--')) {
      result.push(next);
    }
  }
  return result;
};

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runAmendWorkflow({
        config,
        logger,
        options: {
          message: getFlag('--message'),
          add: collectMulti('--add'),
          remove: collectMulti('--remove'),
          force: hasFlag('--force'),
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
