/**
 * git-resolve — Resolve all merge conflicts by taking one side completely.
 *
 * Usage:
 *   git-resolve --theirs           # accept all incoming changes
 *   git-resolve --ours             # keep all our changes
 *   git-resolve --theirs src/api.ts   # resolve specific file only
 */
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runResolveConflictsWorkflow } from '../src/workflows/resolve-conflicts.js';

const HELP = `
Usage: git-resolve --theirs|--ours [files...]

Resolves merge conflicts by accepting one side completely.
Run inside a merge, rebase, or cherry-pick that has conflicts.

Options:
  --theirs          Accept all incoming changes (from the branch being merged in)
  --ours            Keep all local changes (discard incoming)
  --files <f>...    Resolve specific files only (default: all conflicted files)
  -h, --help        Show this help

After resolving:
  git commit                    (for merge)
  git rebase --continue         (for rebase)
  git cherry-pick --continue    (for cherry-pick)
`.trim();

const { hasFlag, args } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const useTheirs = hasFlag('--theirs');
const useOurs = hasFlag('--ours');
if (!useTheirs && !useOurs) {
  process.stderr.write('Error: --theirs or --ours is required.\n\n' + HELP + '\n');
  process.exit(1);
}
if (useTheirs && useOurs) {
  process.stderr.write('Error: use --theirs OR --ours, not both.\n');
  process.exit(1);
}

// Collect files after --files flag or any positional non-flag args
const filesIdx = args.indexOf('--files');
const files: string[] =
  filesIdx >= 0 ? args.slice(filesIdx + 1).filter((f) => !f.startsWith('--')) : [];

const logger = createLogger({ debug: hasFlag('--debug') });

try {
  runResolveConflictsWorkflow({
    logger,
    options: {
      strategy: useTheirs ? 'theirs' : 'ours',
      ...(files.length > 0 ? { files } : {}),
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
