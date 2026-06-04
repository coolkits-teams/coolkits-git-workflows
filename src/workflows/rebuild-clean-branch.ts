import { spawnSync } from 'node:child_process';

import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import { GitControlsError } from '../errors.js';
import type {
  Config,
  Logger,
  RebuildCleanBranchOptions,
  RebuildCleanBranchResult,
} from '../types.js';

/**
 * Rebuilds a contaminated feature branch as a clean single-commit branch
 * based on a known-good base branch (e.g. "root" or "main").
 *
 * Problem it solves:
 *   A feature branch accidentally received code from other unreleased features
 *   (e.g. someone merged "main" or another feature branch into it instead of
 *   merging from "root"). This workflow creates a fresh branch from the base,
 *   applies ONLY the diff between base..contaminated-branch, and squashes it
 *   into a single clean commit — leaving no contamination in the history.
 *
 * How it works:
 *   1. git checkout -b <clean-branch> <base>
 *   2. git diff <base>..<source> | git apply --index
 *   3. git commit -m "<message>"
 *   4. (optional) git push
 *
 * Trade-off:
 *   Individual commit history is squashed into one commit.
 *   Use this when the original history is already polluted and not worth keeping.
 *   If you need to preserve individual commits, use cherry-pick instead.
 */
export function runRebuildCleanBranchWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: RebuildCleanBranchOptions;
}): RebuildCleanBranchResult {
  const git = createGitClient();
  const workingTree = createWorkingTreeInspector({ git });

  // ── Pre-flight ─────────────────────────────────────────────────────────────

  if (!workingTree.isGitRepository()) {
    throw new GitControlsError('Not inside a git repository.');
  }

  workingTree.assertClean();

  // ── Resolve branches ───────────────────────────────────────────────────────

  const currentBranch = git.runOrThrow(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const sourceBranch = options.branch?.trim() ?? currentBranch;
  const baseBranch = options.base?.trim() ?? config.mainBranch;

  // Validate source branch exists (local or remote)
  const sourceExists =
    git.run(['show-ref', '--verify', `refs/heads/${sourceBranch}`]).ok ||
    git.run(['show-ref', '--verify', `refs/remotes/${config.remote}/${sourceBranch}`]).ok;
  if (!sourceExists) {
    throw new GitControlsError(`Source branch '${sourceBranch}' does not exist.`);
  }

  // Validate base branch exists (local or remote)
  const baseExists =
    git.run(['show-ref', '--verify', `refs/heads/${baseBranch}`]).ok ||
    git.run(['show-ref', '--verify', `refs/remotes/${config.remote}/${baseBranch}`]).ok;
  if (!baseExists) {
    throw new GitControlsError(`Base branch '${baseBranch}' does not exist.`, [
      `Make sure '${baseBranch}' is fetched: git fetch ${config.remote} ${baseBranch}`,
    ]);
  }

  if (sourceBranch === baseBranch) {
    throw new GitControlsError(`Source and base branch are the same: '${sourceBranch}'.`);
  }

  // ── Detect changes ─────────────────────────────────────────────────────────

  const changedFiles = git
    .run(['diff', '--name-only', `${baseBranch}..${sourceBranch}`])
    .stdout.split('\n')
    .filter(Boolean);
  const filesChanged = changedFiles.length;

  if (filesChanged === 0) {
    logger.warn(`No differences found between '${baseBranch}' and '${sourceBranch}'.`);
    return {
      status: 'noop',
      sourceBranch,
      baseBranch,
      cleanBranch: sourceBranch,
      filesChanged: 0,
    };
  }

  // ── Resolve output branch name ─────────────────────────────────────────────

  const cleanBranch =
    options.output?.trim() ??
    (() => {
      // Strip common prefixes to get the slug (e.g. "feature/payment-table" → "payment-table")
      const slug = sourceBranch.replace(/^[^/]+\//, '');
      return `fix/${slug}-clean`;
    })();

  // Make sure the clean branch doesn't already exist
  if (git.run(['show-ref', '--verify', `refs/heads/${cleanBranch}`]).ok) {
    throw new GitControlsError(`Output branch '${cleanBranch}' already exists.`, [
      `Delete it first: git branch -D ${cleanBranch}`,
      `Or specify a different name: --output <branch-name>`,
    ]);
  }

  // ── Build commit message ───────────────────────────────────────────────────

  const commitMessage =
    options.message?.trim() ??
    [
      `chore: rebuild clean branch from ${baseBranch}`,
      '',
      `Source : ${sourceBranch}`,
      `Base   : ${baseBranch}`,
      `Files  : ${String(filesChanged)} changed`,
      '',
      `Squashed from contaminated history. The original branch had code`,
      `from other unreleased features mixed in via incorrect merges.`,
    ].join('\n');

  // ── Dry run ────────────────────────────────────────────────────────────────

  if (options.dryRun) {
    logger.info(`[dry-run] Would create: '${cleanBranch}' from base '${baseBranch}'`);
    logger.info(`[dry-run] Source      : ${sourceBranch}`);
    logger.info(`[dry-run] Files       : ${String(filesChanged)} would be applied`);
    const preview = changedFiles.slice(0, 15);
    preview.forEach((f) => {
      logger.plain(`  + ${f}`);
    });
    if (filesChanged > 15) logger.plain(`  ... and ${String(filesChanged - 15)} more`);
    return { status: 'dry-run', sourceBranch, baseBranch, cleanBranch, filesChanged };
  }

  // ── Create clean branch ────────────────────────────────────────────────────

  logger.info(`Source branch    : ${sourceBranch}`);
  logger.info(`Base branch      : ${baseBranch}`);
  logger.info(`New clean branch : ${cleanBranch}`);
  logger.info(`Files to apply   : ${String(filesChanged)}`);

  // Step 1 — Checkout new branch from base
  logger.info(`\nStep 1/3 — Creating '${cleanBranch}' from '${baseBranch}'...`);
  git.runOrThrow(['checkout', '-b', cleanBranch, baseBranch]);
  logger.ok(`Checked out '${cleanBranch}'.`);

  // Step 2 — Pipe diff into git apply --index
  // We use spawnSync directly so we can pass the diff output as stdin.
  logger.info(`Step 2/3 — Applying diff from '${baseBranch}..${sourceBranch}'...`);

  const diffOutput = git.runOrThrow(['diff', `${baseBranch}..${sourceBranch}`]);

  if (!diffOutput.trim()) {
    git.run(['checkout', currentBranch]);
    git.run(['branch', '-D', cleanBranch]);
    throw new GitControlsError('Diff output was empty — nothing to apply.');
  }

  const applyResult = spawnSync('git', ['apply', '--index'], {
    input: diffOutput,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (applyResult.status !== 0) {
    // Rollback: go back to original branch and delete the half-created clean branch
    git.run(['checkout', currentBranch]);
    git.run(['branch', '-D', cleanBranch]);
    throw new GitControlsError('Failed to apply diff cleanly.', [
      applyResult.stderr.trim() || 'Unknown apply error.',
      'This can happen if the base branch is not a clean ancestor of the source branch.',
      `Verify: git merge-base ${baseBranch} ${sourceBranch}`,
      'If conflicts exist, resolve them manually and use git add + git commit.',
    ]);
  }

  logger.ok(`Diff applied. ${String(filesChanged)} file(s) staged.`);

  // Step 3 — Commit everything as one clean squashed commit
  logger.info(`Step 3/3 — Committing as single clean commit...`);
  git.runOrThrow(['commit', '-m', commitMessage]);
  logger.ok(`Committed.`);

  // ── Optional push ──────────────────────────────────────────────────────────

  if (options.push) {
    logger.info(`Pushing '${cleanBranch}' to '${config.remote}'...`);
    git.runOrThrow(['push', '-u', config.remote, cleanBranch]);
    logger.ok(`Pushed to ${config.remote}/${cleanBranch}.`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  logger.plain('');
  logger.ok(`Clean branch ready: ${cleanBranch}`);
  logger.plain(`  Base             : ${baseBranch}`);
  logger.plain(`  Files changed    : ${String(filesChanged)}`);
  logger.plain(`  Verify with      : git diff ${baseBranch}..${cleanBranch} --stat`);
  if (!options.push) {
    logger.plain(`  Push when ready  : git push -u ${config.remote} ${cleanBranch}`);
  }

  return { status: 'rebuilt', sourceBranch, baseBranch, cleanBranch, filesChanged };
}
