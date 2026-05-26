import type { ArchitecturePreset, Config } from '../types.js';

/**
 * The subset of Config that each architecture preset defines.
 * Individual fields in the user's config file always override these.
 */
type PresetDefaults = Omit<
  Config,
  // User must supply these (or fall back to DEFAULT_CONFIG base)
  'featurePath' | 'commonExcludePaths' | 'commonExcludeFiles' | 'remote' | 'mergeRequestProvider'
>;

const PRESETS: Record<ArchitecturePreset, PresetDefaults> = {
  /**
   * Feature-based architecture (default).
   *
   * Branch roles:
   *   root        — canonical common/shared source; extract-common MRs target here
   *   dev         — dev-build integration; feature MRs target here for CI builds
   *   feature/*   — active development; sync from root, extract common changes
   *
   * Key commands: git-extract-common, git-sync-from-root, git-create-mr
   */
  'feature-based': {
    architecture: 'feature-based',
    mainBranch: 'main',
    developBranch: 'develop',
    rootBranch: 'root',
    devBranch: 'dev',
    stagingBranch: 'staging',
    productionBranch: 'production',
    featureBranchPrefix: 'feature',
    releaseBranchPrefix: 'release',
    hotfixBranchPrefix: 'hotfix',
    commonBranchPrefix: 'common',
    mrBranchPrefix: 'mr',
    protectedBranches: ['root', 'dev', 'main', 'master', 'develop', 'staging', 'production'],
    syncStrategy: 'merge',
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
    rootBranch: 'main',
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
    rootBranch: 'main',
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
    rootBranch: 'main',
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
    rootBranch: 'main',
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
    rootBranch: 'main',
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
  },
};

export function getArchitecturePreset(architecture: ArchitecturePreset): PresetDefaults {
  return PRESETS[architecture];
}

export function isValidArchitecture(value: unknown): value is ArchitecturePreset {
  return typeof value === 'string' && value in PRESETS;
}

export const ARCHITECTURE_PRESETS = PRESETS;
