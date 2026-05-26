import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type {
  ArchitecturePreset,
  Config,
  FinishBranchOptions,
  FinishBranchResult,
  Logger,
} from '../types.js';
import { runCreateMrWorkflow } from './create-mr.js';

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
  const branchType = detectBranchType(branch, config);
  const { primaryTarget, additionalTargets } = resolveTargets({
    config,
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

  // ── Push branch first ────────────────────────────────────────────────────

  logger.info(`Fetching and pushing '${branch}'...`);
  git.runOrThrow(['fetch', config.remote, branch]);
  branches.checkout(branch);
  git.runOrThrow(['push', '-u', config.remote, branch], { stdio: 'inherit' });

  // ── Create primary MR ────────────────────────────────────────────────────

  if (!options.skipMr) {
    runCreateMrWorkflow({
      config,
      logger,
      options: {
        source: branch,
        target: primaryTarget,
        skipPush: true, // already pushed above
      },
    });
  }

  // ── Remind about additional MR targets (gitflow release/hotfix) ──────────

  if (additionalTargets.length > 0) {
    logger.plain('');
    logger.warn(
      `This branch also needs to be merged into: ${additionalTargets.map((t) => `'${t}'`).join(', ')}`,
    );
    logger.warn('After the primary MR is merged, run:');
    for (const extra of additionalTargets) {
      logger.plain(`  git-create-mr --source ${branch} --target ${extra}`);
    }
  }

  return { status: 'mr-created', branch, targetBranch: primaryTarget, additionalTargets };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectBranchType(
  branch: string,
  config: Config,
): 'feature' | 'release' | 'hotfix' | 'other' {
  if (branch.startsWith(`${config.featureBranchPrefix}/`)) return 'feature';
  if (branch.startsWith(`${config.releaseBranchPrefix}/`)) return 'release';
  if (branch.startsWith(`${config.hotfixBranchPrefix}/`)) return 'hotfix';
  return 'other';
}

function resolveTargets({
  config,
  branchType,
  explicitTarget,
}: {
  config: Config;
  branchType: 'feature' | 'release' | 'hotfix' | 'other';
  explicitTarget?: string | null;
}): { primaryTarget: string; additionalTargets: string[] } {
  if (explicitTarget) {
    return { primaryTarget: explicitTarget, additionalTargets: [] };
  }

  const arch = config.architecture;

  if (arch === 'gitflow') {
    if (branchType === 'release' || branchType === 'hotfix') {
      // release/hotfix: primary → main, additional → develop
      return {
        primaryTarget: config.mainBranch,
        additionalTargets: [config.developBranch],
      };
    }
    // feature → develop
    return { primaryTarget: config.developBranch, additionalTargets: [] };
  }

  // All other architectures: auto-resolve primary target
  const primaryByArch: Record<ArchitecturePreset, keyof Config> = {
    'feature-based': 'devBranch',
    gitflow: 'developBranch',
    'github-flow': 'mainBranch',
    'gitlab-flow': 'mainBranch',
    'trunk-based': 'mainBranch',
    monorepo: 'mainBranch',
  };

  return {
    primaryTarget: config[primaryByArch[arch]] as string,
    additionalTargets: [],
  };
}
