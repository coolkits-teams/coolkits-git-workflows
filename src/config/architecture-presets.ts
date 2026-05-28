import type { ArchitecturePreset, Config } from '../types.js';

/**
 * The subset of Config that each architecture preset defines.
 * Individual fields in the user's config file always override these.
 */
type PresetDefaults = Omit<
  Config,
  // User must supply these (or fall back to DEFAULT_CONFIG base)
  | 'featurePath'
  | 'commonExcludePaths'
  | 'commonExcludeFiles'
  | 'remote'
  | 'mergeRequestProvider'
  // Message formats inherit from DEFAULT_CONFIG unless user overrides
  | 'createMrTitleFormat'
  | 'createMrTitleCheckoutFormat'
  | 'extractCommonMrTitleFormat'
  | 'extractCommonCommitSubjectFormat'
  | 'extractCommonMainMergeFormat'
  | 'commonBranchFormat'
  | 'mrBranchFormat'
  | 'featureBranchFormat'
  | 'releaseBranchFormat'
  | 'hotfixBranchFormat'
  | 'fixBranchFormat'
  | 'choreBranchFormat'
  | 'syncBackupTagFormat'
  | 'fixbugBranchFormat'
  | 'qaBranch'
  | 'uatBranch'
  | 'additionalBranches'
  | 'fixbugBranchPrefix'
  | 'commitMessageFormat'
  | 'commitTypeByBranchPrefix'
  | 'semverBumpByCommitType'
>;

const PRESETS: Record<ArchitecturePreset, PresetDefaults> = {
  /**
   * Feature-based architecture (default).
   *
   * Branch roles:
   *   main        — source of truth; extract-common MRs target here
   *   dev         — dev-build integration; feature MRs target here for CI builds
   *   feature/*   — active development; sync from main, extract common changes
   *
   * Key commands: git-extract-common, git-sync-from-main, git-create-mr
   */
  'feature-based': {
    architecture: 'feature-based',
    mainBranch: 'main',
    developBranch: 'develop',
    devBranch: 'dev',
    stagingBranch: 'staging',
    productionBranch: 'production',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['dev', 'main', 'master', 'develop', 'staging', 'production'],
    syncStrategy: 'merge',
    mrTargetByBranchPrefix: { feature: 'dev', common: 'main' },
    baseBranchByBranchType: { feature: 'dev', hotfix: 'main' },
  },

  /**
   * Environment promotion flow (main / dev / qa / uat).
   *
   * Branch roles:
   *   main        — source of truth; common/* merges here
   *   dev         — all feature development integration
   *   qa          — QA environment
   *   uat         — UAT / pre-production; hotfix & fixbug base
   *   feature/*   — new features → MR to dev
   *   fixbug/*    — sprint fixes → MR to qa
   *   hotfix/*    — emergency fixes from uat → MR to uat
   *   common/*    — shared code → MR to main
   */
  'env-flow': {
    architecture: 'env-flow',
    mainBranch: 'main',
    developBranch: 'dev',
    devBranch: 'dev',
    stagingBranch: 'qa',
    productionBranch: 'uat',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['main', 'dev', 'qa', 'uat', 'master'],
    syncStrategy: 'merge',
    mrTargetByBranchPrefix: {
      feature: 'dev',
      fixbug: 'qa',
      hotfix: 'uat',
      common: 'main',
    },
    baseBranchByBranchType: {
      feature: 'dev',
      fixbug: 'uat',
      hotfix: 'uat',
    },
  },

  /**
   * Gitflow.
   *
   * Branch roles:
   *   main        — production; only receives merges from release/* and hotfix/*
   *   develop     — integration for features; source for release/*
   *   feature/*   — daily development, branches off develop
   *   release/*   — release stabilisation, branches off develop → merges to main + develop
   *   hotfix/*    — urgent fixes off main → merges to main + develop
   *
   * Key commands: git-start-branch, git-finish-branch, git-create-mr
   */
  gitflow: {
    architecture: 'gitflow',
    mainBranch: 'main',
    developBranch: 'develop',
    devBranch: 'develop',
    stagingBranch: 'staging',
    productionBranch: 'main',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['main', 'master', 'develop'],
    syncStrategy: 'merge',
    mrTargetByBranchPrefix: { feature: 'develop', release: 'main', hotfix: 'main' },
    baseBranchByBranchType: { feature: 'develop', release: 'develop', hotfix: 'main' },
  },

  /**
   * GitHub Flow.
   *
   * Branch roles:
   *   main        — always deployable; direct target for all PRs
   *   feature/*   — short-lived; merged directly to main via PR
   *
   * Key commands: git-start-branch, git-finish-branch (→ PR to main), git-create-mr
   */
  'github-flow': {
    architecture: 'github-flow',
    mainBranch: 'main',
    developBranch: 'main',
    devBranch: 'main',
    stagingBranch: 'main',
    productionBranch: 'main',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['main', 'master'],
    syncStrategy: 'rebase',
    mrTargetByBranchPrefix: { feature: 'main' },
    baseBranchByBranchType: { feature: 'main' },
  },

  /**
   * GitLab Flow.
   *
   * Branch roles:
   *   main        — source of truth for features; promotes upward through env branches
   *   staging     — staging environment; receives promotions from main
   *   production  — production environment; receives promotions from staging
   *   feature/*   — development; merged to main via MR
   *
   * Key commands: git-start-branch, git-finish-branch, git-create-mr (promote)
   */
  'gitlab-flow': {
    architecture: 'gitlab-flow',
    mainBranch: 'main',
    developBranch: 'main',
    devBranch: 'main',
    stagingBranch: 'staging',
    productionBranch: 'production',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['main', 'master', 'staging', 'production'],
    syncStrategy: 'merge',
    mrTargetByBranchPrefix: { feature: 'main' },
    baseBranchByBranchType: { feature: 'main' },
  },

  /**
   * Trunk-based development.
   *
   * Branch roles:
   *   main        — trunk; all work lands here quickly (< 1 day per branch ideally)
   *   feature/*   — very short-lived; use feature flags in code to hide WIP
   *
   * Key commands: git-start-branch, git-finish-branch (→ quick MR to main), git-create-mr
   */
  'trunk-based': {
    architecture: 'trunk-based',
    mainBranch: 'main',
    developBranch: 'main',
    devBranch: 'main',
    stagingBranch: 'staging',
    productionBranch: 'main',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['main', 'master'],
    syncStrategy: 'rebase',
    mrTargetByBranchPrefix: { feature: 'main' },
    baseBranchByBranchType: { feature: 'main' },
  },

  /**
   * Monorepo.
   *
   * Branch roles:
   *   main        — integration for all packages
   *   feature/*   — scoped feature branches (e.g. feature/pkg-auth)
   *
   * Key commands: git-start-branch (scope-aware), git-finish-branch, git-create-mr
   */
  monorepo: {
    architecture: 'monorepo',
    mainBranch: 'main',
    developBranch: 'main',
    devBranch: 'main',
    stagingBranch: 'staging',
    productionBranch: 'production',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['main', 'master', 'staging', 'production'],
    syncStrategy: 'merge',
    mrTargetByBranchPrefix: { feature: 'main' },
    baseBranchByBranchType: { feature: 'main' },
  },
};

export function getArchitecturePreset(architecture: ArchitecturePreset): PresetDefaults {
  return PRESETS[architecture];
}

export function isValidArchitecture(value: unknown): value is ArchitecturePreset {
  return typeof value === 'string' && value in PRESETS;
}

export const ARCHITECTURE_PRESETS = PRESETS;
