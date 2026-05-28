import type { Config, SemverBump } from '../types.js';

/**
 * Base defaults for fields that are not driven by the architecture preset.
 * These are the lowest-priority values: preset > DEFAULT_CONFIG > user override.
 */
export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  architecture: 'feature-based',

  mainBranch: 'main',
  developBranch: 'develop',
  devBranch: 'dev',
  stagingBranch: 'staging',
  productionBranch: 'production',
  qaBranch: 'qa',
  uatBranch: 'uat',
  additionalBranches: {},

  featureBranchPrefix: 'feature',
  releaseBranchPrefix: 'release',
  hotfixBranchPrefix: 'hotfix',
  fixbugBranchPrefix: 'fixbug',
  commonBranchPrefix: 'common',
  mrBranchPrefix: 'mr',

  featurePath: 'src/features',
  commonExcludePaths: [],
  commonExcludeFiles: [],

  remote: 'origin',
  protectedBranches: ['dev', 'qa', 'uat', 'main', 'master', 'develop', 'staging', 'production'],
  mergeRequestProvider: 'gitlab',
  syncStrategy: 'merge',

  createMrTitleFormat: '{sourceBranch} → {targetBranch}',
  createMrTitleCheckoutFormat: '[{sourceBranch}] → {targetBranch}',
  extractCommonMrTitleFormat: '[{featureBranch}] common → {mainBranch} ({timestamp})',
  extractCommonCommitSubjectFormat: 'common: extract from {featureBranch} ({timestamp})',
  extractCommonMainMergeFormat:
    'common: merge shared changes from {featureBranch} ({commonBranch} → {mainBranch})',

  commonBranchFormat: '{commonBranchPrefix}/{featureSlug}-{timestamp}',
  mrBranchFormat: '{mrBranchPrefix}/{sourceSlug}-{timestamp}',
  featureBranchFormat: '{featureBranchPrefix}/{nameSlug}',
  releaseBranchFormat: '{releaseBranchPrefix}/{nameSlug}',
  hotfixBranchFormat: '{hotfixBranchPrefix}/{nameSlug}',
  fixbugBranchFormat: '{fixbugBranchPrefix}/{nameSlug}',
  fixBranchFormat: 'fix/{nameSlug}',
  choreBranchFormat: 'chore/{nameSlug}',
  syncBackupTagFormat: 'backup/{branchSlug}-{timestamp}',

  commitMessageFormat: '{type}({scope}) {ticketId}: {description}',
  commitTypeByBranchPrefix: {
    feature: 'feat',
    fixbug: 'fix',
    hotfix: 'fix',
    common: 'chore',
    release: 'chore',
    fix: 'fix',
    chore: 'chore',
  },
  mrTargetByBranchPrefix: {},
  baseBranchByBranchType: {},
  semverBumpByCommitType: {
    feat: 'minor',
    fix: 'patch',
    refactor: 'none',
    style: 'none',
    test: 'none',
    docs: 'none',
    chore: 'none',
    perf: 'patch',
  } satisfies Readonly<Partial<Record<string, SemverBump>>>,
});
