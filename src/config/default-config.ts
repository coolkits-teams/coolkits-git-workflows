import type { Config } from '../types.js';

/**
 * Base defaults for fields that are not driven by the architecture preset.
 * These are the lowest-priority values: preset > DEFAULT_CONFIG > user override.
 */
export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  architecture: 'feature-based',

  // Branch names — overridden by preset, then by user config
  mainBranch: 'main',
  developBranch: 'develop',
  rootBranch: 'root',
  devBranch: 'dev',
  stagingBranch: 'staging',
  productionBranch: 'production',

  // Branch prefixes
  featureBranchPrefix: 'feature',
  releaseBranchPrefix: 'release',
  hotfixBranchPrefix: 'hotfix',
  commonBranchPrefix: 'common',
  mrBranchPrefix: 'mr',

  // feature-based specific
  featurePath: 'src/features',
  commonExcludePaths: [],
  commonExcludeFiles: [],

  // Shared
  remote: 'origin',
  protectedBranches: ['root', 'dev', 'main', 'master', 'develop', 'staging', 'production'],
  mergeRequestProvider: 'gitlab',
  syncStrategy: 'merge',
});
