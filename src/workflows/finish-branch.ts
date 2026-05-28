import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type { Config, FinishBranchOptions, FinishBranchResult, Logger } from '../types.js';
import { detectBranchPrefixKey, resolveMrTargetBranch } from '../utils/workflow-resolver.js';
import { runCreateMrWorkflow } from './create-mr.js';

type FinishBranchKind = 'feature' | 'fixbug' | 'release' | 'hotfix' | 'common' | 'other';

export function runFinishBranchWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: FinishBranchOptions;
}): FinishBranchResult {
  const git = createGitClient();
  const branches = createBranchResolver({ git, config });
  const workingTree = createWorkingTreeInspector({ git });

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  const branch = options.branch ?? branches.resolve();
  const branchType = detectFinishBranchType(branch, config);
  const { primaryTarget, additionalTargets } = resolveTargets({
    config,
    branch,
    branchType,
    ...(options.target != null ? { explicitTarget: options.target } : {}),
  });

  logger.info(`Finishing branch: ${branch}`);
  logger.info(`Branch type:      ${branchType}`);
  logger.info(`Primary target:   ${primaryTarget}`);
  if (additionalTargets.length > 0) {
    logger.info(`Also targets:     ${additionalTargets.join(', ')}`);
  }

  if (options.dryRun) {
    logger.ok(`[DRY-RUN] Would create MR: '${branch}' → '${primaryTarget}'.`);
    if (additionalTargets.length > 0) {
      logger.ok(`[DRY-RUN] Also needs MR: '${branch}' → '${additionalTargets.join("', '")}'.`);
    }
    return { status: 'dry-run', branch, targetBranch: primaryTarget, additionalTargets };
  }

  logger.info(`Fetching and pushing '${branch}'...`);
  git.runOrThrow(['fetch', config.remote, branch]);
  branches.checkout(branch);
  git.runOrThrow(['push', '-u', config.remote, branch], { stdio: 'inherit' });

  if (!options.skipMr) {
    runCreateMrWorkflow({
      config,
      logger,
      options: {
        source: branch,
        target: primaryTarget,
        skipPush: true,
      },
    });
  }

  if (additionalTargets.length > 0) {
    logger.plain('');
    logger.warn(
      `This branch also needs to be merged into: ${additionalTargets.map((t) => `'${t}'`).join(', ')}`,
    );
    logger.warn('After the primary MR is merged, run:');
    for (const extra of additionalTargets) {
      logger.plain(`  coolkit create-mr --source ${branch} --target ${extra}`);
    }
  }

  return { status: 'mr-created', branch, targetBranch: primaryTarget, additionalTargets };
}

function detectFinishBranchType(branch: string, config: Config): FinishBranchKind {
  const key = detectBranchPrefixKey(branch, config);
  if (
    key === 'feature' ||
    key === 'fixbug' ||
    key === 'release' ||
    key === 'hotfix' ||
    key === 'common'
  ) {
    return key;
  }
  return 'other';
}

function resolveTargets({
  config,
  branch,
  branchType,
  explicitTarget,
}: {
  config: Config;
  branch: string;
  branchType: FinishBranchKind;
  explicitTarget?: string | null;
}): { primaryTarget: string; additionalTargets: string[] } {
  if (explicitTarget) {
    return { primaryTarget: explicitTarget, additionalTargets: [] };
  }

  if (branchType !== 'other') {
    return { primaryTarget: resolveMrTargetBranch(config, branch), additionalTargets: [] };
  }

  if (config.architecture === 'gitflow') {
    return { primaryTarget: config.developBranch, additionalTargets: [] };
  }

  return { primaryTarget: resolveMrTargetBranch(config, branch), additionalTargets: [] };
}
