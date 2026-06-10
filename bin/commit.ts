/**
 * coolkit commit — Conventional commit builder with guided interactive mode.
 *
 * Usage (direct):
 *   coolkit commit feat "add payment gateway"
 *   coolkit commit fix "login loop" --scope auth
 *   coolkit commit feat "add UI" --scope dashboard --all
 *   coolkit commit feat "breaking" --breaking "removed legacy API"
 *
 * Usage (interactive):
 *   coolkit commit --interactive
 *   coolkit commit          # interactive when no type/message provided
 */

import readline from 'node:readline/promises';

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runCommitWorkflow } from '../src/workflows/commit.js';

const VALID_TYPES = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'style', 'ci', 'build', 'perf', 'revert'];

const HELP = `
Usage: coolkit commit <type> <message> [options]
       coolkit commit --interactive

Creates a conventional commit. Enforces the format: type(scope): message

Arguments:
  <type>             Commit type: ${VALID_TYPES.join(', ')}
  <message>          Short description in imperative mood.

Options:
  --scope <scope>    Scope (e.g. auth, payment, dashboard).
  --body <text>      Longer description paragraph.
  --breaking <text>  Breaking change description (adds BREAKING CHANGE footer).
  --all              Run git add -A before committing.
  --interactive      Guided interactive prompt mode.
  --debug            Verbose logging.
  -h, --help         Show this help.

Examples:
  coolkit commit feat "add OAuth2 login" --scope auth
  coolkit commit fix "handle null on logout"
  coolkit commit feat "new checkout flow" --breaking "removed old cart API" --all
  coolkit commit --interactive
`.trim();

async function promptInteractive(): Promise<{
  type: string;
  scope: string | null;
  message: string;
  body: string | null;
  breaking: string | null;
  all: boolean;
}> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    process.stdout.write('\ncoolkit commit — interactive mode\n');
    process.stdout.write(`Valid types: ${VALID_TYPES.join(', ')}\n\n`);

    let type = '';
    while (!VALID_TYPES.includes(type)) {
      type = (await rl.question('Type: ')).trim();
      if (!VALID_TYPES.includes(type)) {
        process.stdout.write(`  Invalid type. Choose from: ${VALID_TYPES.join(', ')}\n`);
      }
    }

    const scopeRaw = (await rl.question('Scope (press Enter to skip): ')).trim();
    const scope = scopeRaw || null;

    let message = '';
    while (!message) {
      message = (await rl.question('Description: ')).trim();
      if (!message) process.stdout.write('  Description cannot be empty.\n');
    }

    const bodyRaw = (await rl.question('Body (press Enter to skip): ')).trim();
    const body = bodyRaw || null;

    const breakingRaw = (await rl.question('Breaking change description (press Enter to skip): ')).trim();
    const breaking = breakingRaw || null;

    const allRaw = (await rl.question('Stage all changes? (y/N): ')).trim().toLowerCase();
    const all = allRaw === 'y' || allRaw === 'yes';

    // Show preview
    const subject = scope ? `${type}(${scope}): ${message}` : `${type}: ${message}`;
    process.stdout.write(`\nPreview: ${subject}\n`);
    if (body) process.stdout.write(`\n${body}\n`);
    if (breaking) process.stdout.write(`\nBREAKING CHANGE: ${breaking}\n`);
    process.stdout.write('\n');

    const confirm = (await rl.question('Commit? (Y/n): ')).trim().toLowerCase();
    if (confirm === 'n' || confirm === 'no') {
      process.stdout.write('Aborted.\n');
      process.exit(0);
    }

    return { type, scope, message, body, breaking, all };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  let commitOptions: {
    type: string | null;
    scope: string | null;
    message: string | null;
    body: string | null;
    breaking: string | null;
    all: boolean;
  };

  const isInteractive = hasFlag('--interactive') || (positionals.length === 0 && !getFlag('--type'));

  if (isInteractive) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        'Error: interactive mode requires a TTY. Use direct mode: coolkit commit <type> <message>\n',
      );
      process.exit(1);
    }
    commitOptions = await promptInteractive();
  } else {
    commitOptions = {
      type: positionals[0] ?? getFlag('--type'),
      message: positionals[1] ?? getFlag('--message') ?? getFlag('--msg'),
      scope: getFlag('--scope'),
      body: getFlag('--body'),
      breaking: getFlag('--breaking'),
      all: hasFlag('--all'),
    };
  }

  try {
    runCommitWorkflow({
      config,
      logger,
      options: commitOptions,
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

void main();
