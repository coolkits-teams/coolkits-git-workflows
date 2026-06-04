import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type { Config, Logger } from '../types.js';

export interface CleanLocalOptions {
  /**
   * Override the safe branch to land on before wiping all other branches.
   * Default: config.mainBranch.
   */
  base?: string | null;
  /**
   * Also remove untracked ignored files (git clean -fdx).
   * Default: false — only removes untracked non-ignored files (git clean -fd).
   */
  withIgnored?: boolean;
  /** Preview what would happen without making any changes. */
  dryRun?: boolean;
}

export interface CleanLocalResult {
  status: 'cleaned' | 'dry-run';
  baseBranch: string;
  deletedBranches: string[];
}

/**
 * clean-local workflow
 *
 * Resets the local repo to a pristine state matching the remote:
 *   1. git fetch origin --prune          — sync remote state, drop stale refs
 *   2. git checkout <base>               — land on the safe branch
 *   3. git reset --hard origin/<base>    — align local HEAD with remote
 *   4. delete every other local branch   — no confirmation, like a fresh clone
 *   5. git clean -fd[x]                  — remove untracked files (and ignored if --with-ignored)
 *
 * Protected branches are never deleted (only checked out).
 * Use --dry-run to preview without making changes.
 */
export function runCleanLocalWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: CleanLocalOptions;
}): CleanLocalResult {
  const git = createGitClient();
  const workingTree = createWorkingTreeInspector({ git });

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  const baseBranch = options.base ?? config.mainBranch;
  const baseRef = `${config.remote}/${baseBranch}`;

  // ── Preflight warning ───────────────────────────────────────────────────────

  logger.warn('WARNING: This will permanently delete ALL local branches except the base branch,');
  logger.warn(`         reset '${baseBranch}' to '${baseRef}', and remove untracked files.`);
  logger.warn('         Uncommitted work will be lost. Use --dry-run to preview first.');

  if (options.dryRun) {
    logger.ok('[DRY-RUN] No changes made.');
    return { status: 'dry-run', baseBranch, deletedBranches: [] };
  }

  // ── 1. Fetch + prune ────────────────────────────────────────────────────────

  logger.info(`Fetching '${config.remote}' (--prune)...`);
  git.runOrThrow(['fetch', config.remote, '--prune']);

  // ── 2. Checkout base branch ─────────────────────────────────────────────────

  logger.info(`Checking out '${baseBranch}'...`);
  const localBaseExists = git.run(['show-ref', '--verify', `refs/heads/${baseBranch}`]).ok;
  if (localBaseExists) {
    git.runOrThrow(['checkout', baseBranch]);
  } else {
    git.runOrThrow(['checkout', '-b', baseBranch, baseRef]);
  }

  // ── 3. Reset base branch to remote ─────────────────────────────────────────

  logger.info(`Resetting '${baseBranch}' → '${baseRef}'...`);
  git.runOrThrow(['reset', '--hard', baseRef]);

  // ── 4. Delete every other local branch ─────────────────────────────────────

  const allLocal = git
    .runOrThrow(['branch', '--format=%(refname:short)'])
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);

  const toDelete = allLocal.filter((b) => b !== baseBranch);

  if (toDelete.length === 0) {
    logger.ok('No other local branches to delete.');
  } else {
    logger.info(`Deleting ${toDelete.length.toString()} local branch(es)...`);
    // Use -D (force) — we confirmed intent via the warning above.
    git.runOrThrow(['branch', '-D', ...toDelete]);
    toDelete.forEach((b) => {
      logger.plain(`  ✓ deleted ${b}`);
    });
  }

  // ── 5. Clean untracked files ────────────────────────────────────────────────

  const cleanFlags = options.withIgnored === true ? ['-fdx'] : ['-fd'];
  logger.info(`Cleaning untracked files (git clean ${cleanFlags.join(' ')})...`);
  git.runOrThrow(['clean', ...cleanFlags]);

  logger.ok(`Done. Local repo is clean and matches '${baseRef}'.`);
  logger.plain(`To restore a branch: git checkout <branch-name>`);

  return { status: 'cleaned', baseBranch, deletedBranches: toDelete };
}
