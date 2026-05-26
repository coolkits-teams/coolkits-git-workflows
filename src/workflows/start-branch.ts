import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type {
  ArchitecturePreset,
  BranchType,
  Config,
  Logger,
  StartBranchOptions,
  StartBranchResult,
} from '../types.js';

export function runStartBranchWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: StartBranchOptions;
}): StartBranchResult {
  const git = createGitClient();
  const workingTree = createWorkingTreeInspector({ git });

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  workingTree.assertClean();

  const type = options.type ?? 'feature';
  const { branchName, baseBranch } = resolveBranchParams({
    config,
    type,
    name: options.name,
    ...(options.from != null ? { from: options.from } : {}),
  });
  const shouldPush = options.push !== false;

  // ── Fetch + validate base ────────────────────────────────────────────────

  logger.info(`Fetching '${config.remote}/${baseBranch}'...`);
  git.runOrThrow(['fetch', config.remote, baseBranch]);

  const baseRef = `${config.remote}/${baseBranch}`;

  // ── Create branch ────────────────────────────────────────────────────────

  logger.info(`Creating '${branchName}' from '${baseRef}'...`);
  git.runOrThrow(['checkout', '-b', branchName, baseRef]);
  logger.ok(`Checked out new branch '${branchName}'.`);

  // ── Push ─────────────────────────────────────────────────────────────────

  if (shouldPush) {
    logger.info(`Pushing '${branchName}' to ${config.remote}...`);
    git.runOrThrow(['push', '-u', config.remote, branchName], { stdio: 'inherit' });
    logger.ok(`Branch '${branchName}' tracking ${config.remote}/${branchName}.`);
  }

  logger.ok(`Ready to work on '${branchName}'.`);
  printNextSteps({ config, type, logger });

  return { status: 'created', branch: branchName, basedOn: baseBranch };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveBranchParams({
  config,
  type,
  name,
  from,
}: {
  config: Config;
  type: BranchType;
  name: string;
  from?: string | null;
}): { branchName: string; baseBranch: string } {
  const slug = name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const prefixMap: Record<BranchType, string> = {
    feature: config.featureBranchPrefix,
    release: config.releaseBranchPrefix,
    hotfix: config.hotfixBranchPrefix,
    fix: 'fix',
    chore: 'chore',
  };
  const prefix = prefixMap[type];
  const branchName = `${prefix}/${slug}`;

  const baseBranch = from ?? resolveBaseBranch(config, type);

  return { branchName, baseBranch };
}

function resolveBaseBranch(config: Config, type: BranchType): string {
  const arch = config.architecture;

  if (type === 'hotfix') {
    // Hotfix always branches off the canonical production branch
    const prodByArch: Record<ArchitecturePreset, keyof Config> = {
      'feature-based': 'mainBranch',
      gitflow: 'mainBranch',
      'github-flow': 'mainBranch',
      'gitlab-flow': 'mainBranch',
      'trunk-based': 'mainBranch',
      monorepo: 'mainBranch',
    };
    return config[prodByArch[arch]] as string;
  }

  if (type === 'release') {
    // Release branches off integrate branch
    const releaseBaseByArch: Record<ArchitecturePreset, keyof Config> = {
      'feature-based': 'devBranch',
      gitflow: 'developBranch',
      'github-flow': 'mainBranch',
      'gitlab-flow': 'mainBranch',
      'trunk-based': 'mainBranch',
      monorepo: 'mainBranch',
    };
    return config[releaseBaseByArch[arch]] as string;
  }

  // feature / fix / chore
  const featureBaseByArch: Record<ArchitecturePreset, keyof Config> = {
    'feature-based': 'devBranch',
    gitflow: 'developBranch',
    'github-flow': 'mainBranch',
    'gitlab-flow': 'mainBranch',
    'trunk-based': 'mainBranch',
    monorepo: 'mainBranch',
  };
  return config[featureBaseByArch[arch]] as string;
}

function printNextSteps({
  config,
  type,
  logger,
}: {
  config: Config;
  type: BranchType;
  logger: Logger;
}): void {
  const arch = config.architecture;

  logger.plain('');
  logger.plain('Next steps:');

  if (arch === 'feature-based') {
    logger.plain(`  Develop your changes, then:`);
    logger.plain(`  git-create-mr --target ${config.devBranch}          # dev build MR`);
    logger.plain(`  git-extract-common                                   # common code MR → root`);
    return;
  }

  if (arch === 'gitflow') {
    if (type === 'release' || type === 'hotfix') {
      logger.plain(`  Stabilise the ${type}, then:`);
      logger.plain(
        `  git-finish-branch                                  # MR → ${config.mainBranch} + ${config.developBranch}`,
      );
    } else {
      logger.plain(`  Develop your changes, then:`);
      logger.plain(
        `  git-finish-branch                                  # MR → ${config.developBranch}`,
      );
    }
    return;
  }

  logger.plain(`  Develop your changes, then:`);
  logger.plain(
    `  git-create-mr                                          # MR → ${config.mainBranch}`,
  );
  logger.plain(`  # or: git-finish-branch`);
}
