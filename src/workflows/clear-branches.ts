import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, GitClient, Logger } from '../types.js';

export interface ClearBranchesOptions {
  /** Branch to land on before deleting others. Default: config.mainBranch */
  base?: string | null;
  /** Preview without deleting. */
  dryRun?: boolean;
  /**
   * Delete every local branch except the base branch only.
   * Default: also keep config.protectedBranches and long-lived env branches.
   */
  all?: boolean;
}

export interface ClearBranchesResult {
  status: 'cleared' | 'dry-run' | 'noop';
  baseBranch: string;
  kept: string[];
  deleted: string[];
}

function collectKeepBranches(config: Config, baseBranch: string, all: boolean): Set<string> {
  const keep = new Set<string>([baseBranch]);

  if (all) return keep;

  for (const branch of config.protectedBranches) {
    keep.add(branch);
  }

  keep.add(config.devBranch);
  keep.add(config.developBranch);
  keep.add(config.qaBranch);
  keep.add(config.uatBranch);
  if (config.preUatBranch.trim() !== '') {
    keep.add(config.preUatBranch);
  }
  keep.add(config.stagingBranch);
  keep.add(config.productionBranch);

  for (const branch of Object.values(config.additionalBranches)) {
    if (branch.trim() !== '') keep.add(branch);
  }

  return keep;
}

function listLocalBranches(git: GitClient): string[] {
  return git
    .runOrThrow(['branch', '--format=%(refname:short)'])
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);
}

export function runClearBranchesWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: ClearBranchesOptions;
}): ClearBranchesResult {
  const git = createGitClient();
  const baseBranch = options.base?.trim() ?? config.mainBranch;
  const keep = collectKeepBranches(config, baseBranch, options.all === true);

  logger.info(`Fetching '${config.remote}' (--prune)...`);
  if (options.dryRun !== true) {
    git.runOrThrow(['fetch', config.remote, '--prune']);
  } else {
    git.run(['fetch', config.remote, '--prune']);
  }

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (currentBranch !== baseBranch) {
    logger.info(`Checking out '${baseBranch}'...`);
    if (options.dryRun !== true) {
      const localExists = git.run(['show-ref', '--verify', `refs/heads/${baseBranch}`]).ok;
      if (localExists) {
        git.runOrThrow(['checkout', baseBranch]);
      } else {
        const remoteRef = `${config.remote}/${baseBranch}`;
        if (!git.run(['rev-parse', '--verify', remoteRef]).ok) {
          throw new GitControlsError(
            `Base branch '${baseBranch}' does not exist locally or on remote.`,
          );
        }
        git.runOrThrow(['checkout', '-b', baseBranch, remoteRef]);
      }
    }
  }

  const allLocal = listLocalBranches(git);
  const toDelete = allLocal.filter((b) => !keep.has(b));

  if (toDelete.length === 0) {
    logger.ok('No local branches to delete — already clean.');
    return {
      status: 'noop',
      baseBranch,
      kept: [...keep].filter((b) => allLocal.includes(b)),
      deleted: [],
    };
  }

  logger.info(
    options.all === true
      ? `Will delete ${toDelete.length.toString()} local branch(es); keeping only '${baseBranch}'.`
      : `Will delete ${toDelete.length.toString()} local branch(es); keeping protected/long-lived branches.`,
  );

  logger.plain('  Keeping:');
  [...keep]
    .filter((b) => allLocal.includes(b))
    .sort()
    .forEach((b) => {
      logger.plain(`    ${b}`);
    });

  logger.plain('  Deleting:');
  toDelete.forEach((b) => {
    logger.plain(`    - ${b}`);
  });

  if (options.dryRun === true) {
    logger.ok('[DRY-RUN] No branches deleted.');
    return { status: 'dry-run', baseBranch, kept: [...keep], deleted: toDelete };
  }

  let deleted = 0;
  const deletedBranches: string[] = [];
  for (const branch of toDelete) {
    const result = git.run(['branch', '-D', branch]);
    if (result.ok) {
      logger.ok(`Deleted: ${branch}`);
      deletedBranches.push(branch);
      deleted++;
    } else {
      logger.warn(`Failed to delete '${branch}': ${result.stderr.trim()}`);
    }
  }

  logger.ok(`Cleared ${deleted.toString()} of ${toDelete.length.toString()} local branch(es).`);
  return {
    status: 'cleared',
    baseBranch,
    kept: [...keep].filter((b) => allLocal.includes(b) && !toDelete.includes(b)),
    deleted: deletedBranches,
  };
}
