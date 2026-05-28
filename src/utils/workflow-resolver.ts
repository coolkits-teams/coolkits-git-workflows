import type { ArchitecturePreset, BranchType, Config } from '../types.js';

/** Known branch prefix keys used in mrTargetByBranchPrefix / commitTypeByBranchPrefix. */
export type BranchPrefixKey =
  | 'feature'
  | 'fixbug'
  | 'hotfix'
  | 'common'
  | 'release'
  | 'fix'
  | 'chore';

const PREFIX_KEYS: BranchPrefixKey[] = [
  'feature',
  'fixbug',
  'hotfix',
  'common',
  'release',
  'fix',
  'chore',
];

function prefixForKey(config: Config, key: BranchPrefixKey): string {
  const map: Record<BranchPrefixKey, string> = {
    feature: config.featureBranchPrefix,
    fixbug: config.fixbugBranchPrefix,
    hotfix: config.hotfixBranchPrefix,
    common: config.commonBranchPrefix,
    release: config.releaseBranchPrefix,
    fix: 'fix',
    chore: 'chore',
  };
  return map[key];
}

/** Detect which configured prefix key a branch name belongs to. */
export function detectBranchPrefixKey(branch: string, config: Config): BranchPrefixKey | null {
  for (const key of PREFIX_KEYS) {
    const prefix = prefixForKey(config, key);
    if (branch === prefix || branch.startsWith(`${prefix}/`)) {
      return key;
    }
  }
  return null;
}

/** Resolve default MR target from source branch prefix map, then architecture defaults. */
export function resolveMrTargetBranch(config: Config, sourceBranch: string): string {
  const prefixKey = detectBranchPrefixKey(sourceBranch, config);
  if (prefixKey != null) {
    const mapped = config.mrTargetByBranchPrefix[prefixKey];
    if (mapped != null && mapped !== '') {
      return mapped;
    }
  }

  const targetByArch: Record<ArchitecturePreset, keyof Config> = {
    'feature-based': 'devBranch',
    'env-flow': 'devBranch',
    gitflow: 'developBranch',
    'github-flow': 'mainBranch',
    'gitlab-flow': 'mainBranch',
    'trunk-based': 'mainBranch',
    monorepo: 'mainBranch',
  };
  return config[targetByArch[config.architecture]] as string;
}

/** Default commit type for a branch prefix (e.g. feature → feat). */
export function resolveCommitTypeForBranch(
  config: Config,
  branch: string,
  override?: string | null,
): string {
  if (override != null && override.trim() !== '') {
    return override.trim();
  }
  const prefixKey = detectBranchPrefixKey(branch, config);
  if (prefixKey != null) {
    const mapped = config.commitTypeByBranchPrefix[prefixKey];
    if (mapped != null && mapped !== '') {
      return mapped;
    }
  }
  return 'chore';
}

/** Base branch when creating a new branch via start-branch. */
export function resolveStartBaseBranch(config: Config, type: BranchType): string {
  const fromMap = config.baseBranchByBranchType[type];
  if (fromMap != null && fromMap !== '') {
    return fromMap;
  }

  const arch = config.architecture;

  if (type === 'hotfix') {
    const hotfixBase: Record<ArchitecturePreset, keyof Config> = {
      'feature-based': 'mainBranch',
      'env-flow': 'uatBranch',
      gitflow: 'mainBranch',
      'github-flow': 'mainBranch',
      'gitlab-flow': 'mainBranch',
      'trunk-based': 'mainBranch',
      monorepo: 'mainBranch',
    };
    return config[hotfixBase[arch]] as string;
  }

  if (type === 'fixbug') {
    const fixbugBase: Record<ArchitecturePreset, keyof Config> = {
      'feature-based': 'devBranch',
      'env-flow': 'uatBranch',
      gitflow: 'developBranch',
      'github-flow': 'mainBranch',
      'gitlab-flow': 'mainBranch',
      'trunk-based': 'mainBranch',
      monorepo: 'mainBranch',
    };
    return config[fixbugBase[arch]] as string;
  }

  if (type === 'release') {
    const releaseBase: Record<ArchitecturePreset, keyof Config> = {
      'feature-based': 'devBranch',
      'env-flow': 'devBranch',
      gitflow: 'developBranch',
      'github-flow': 'mainBranch',
      'gitlab-flow': 'mainBranch',
      'trunk-based': 'mainBranch',
      monorepo: 'mainBranch',
    };
    return config[releaseBase[arch]] as string;
  }

  const featureBase: Record<ArchitecturePreset, keyof Config> = {
    'feature-based': 'devBranch',
    'env-flow': 'devBranch',
    gitflow: 'developBranch',
    'github-flow': 'mainBranch',
    'gitlab-flow': 'mainBranch',
    'trunk-based': 'mainBranch',
    monorepo: 'mainBranch',
  };
  return config[featureBase[arch]] as string;
}
