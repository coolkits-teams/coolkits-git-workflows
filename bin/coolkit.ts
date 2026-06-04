/**
 * coolkit — main CLI entry point for @coolkits/git-workflows
 *
 * Usage:
 *   coolkit undo --count 2
 *   coolkit create-mr --target dev
 *   coolkit --help
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COMMANDS: Record<string, string> = {
  'extract-common': 'extract-common.js',
  'sync-from-main': 'sync-from-root.js',
  'sync-from-root': 'sync-from-root.js',
  'create-mr': 'create-mr.js',
  'start-branch': 'start-branch.js',
  'finish-branch': 'finish-branch.js',
  undo: 'undo.js',
  'revert-commit': 'revert-commit.js',
  amend: 'amend.js',
  squash: 'squash.js',
  'move-commits': 'move-commits.js',
  'cherry-pick': 'cherry-pick.js',
  'delete-branch': 'delete-branch.js',
  'recover-branch': 'recover-branch.js',
  'prune-branches': 'prune-branches.js',
  abort: 'abort.js',
  resolve: 'resolve.js',
  'pull-rebase': 'pull-rebase.js',
  'purge-file': 'purge-file.js',
  'search-commits': 'search-commits.js',
  bisect: 'bisect.js',
  'tag-create': 'tag-create.js',
  'tag-delete': 'tag-delete.js',
  'rebuild-clean-branch': 'rebuild-clean-branch.js',
  'release-uat': 'release-uat.js',
  'final-release-sync': 'final-release-sync.js',
};

const HELP = `
coolkit — Git workflow automation by Coolkits

Usage:
  coolkit <command> [options]

Commands:
  extract-common   Extract shared code → common branch → MR to main
  sync-from-main   Sync main into current feature branch (alias: sync-from-root)
  create-mr        Create merge/pull request between branches
  start-branch     Create a new feature/release/hotfix branch
  finish-branch    Push branch and open MR(s)

  undo             Undo unpushed commits
  revert-commit    Safely revert a pushed commit
  amend            Fix last commit (message, add/remove files)
  squash           Squash last N commits into one
  move-commits     Move commits to the correct branch
  cherry-pick      Apply commit(s) from another branch
  delete-branch    Delete branch local + remote
  recover-branch   Recover a deleted branch from reflog
  prune-branches   Clean up stale local branches
  abort            Abort stuck merge/rebase/cherry-pick
  resolve          Resolve conflicts (--theirs / --ours)
  pull-rebase      Pull with rebase (no merge commit)
  purge-file       Remove sensitive file from entire history
  search-commits   Find commits by message or content
  bisect           Binary search for bug-introducing commit
  tag-create       Create annotated tag + push
  tag-delete       Delete tag local + remote

  rebuild-clean-branch  Rebuild a contaminated branch as a clean single-commit branch
  release-uat           Sync root into feature branch, then open MR to UAT
  final-release-sync    Sync UAT into root after a successful UAT release

Run 'coolkit <command> --help' for command-specific help.
`.trim();

const [, , command, ...args] = process.argv;

if (!command || command === '--help' || command === '-h' || command === 'help') {
  process.stdout.write(HELP + '\n');
  process.exit(!command ? 1 : 0);
}

const script = COMMANDS[command];
if (!script) {
  process.stderr.write(`Unknown command: ${command}\n\n`);
  process.stdout.write(HELP + '\n');
  process.exit(1);
}

const result = spawnSync(process.execPath, [join(__dirname, script), ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
