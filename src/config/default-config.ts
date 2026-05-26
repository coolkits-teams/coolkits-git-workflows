import type { Config } from '../types.js';

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  /**
   * Common-source integration branch.
   * `git-extract-common` opens MRs into this branch.
   * `git-sync-from-root` merges this branch into the feature branch.
   */
  rootBranch: 'root',

  /**
   * Team dev integration branch.
   * Feature branches open MRs into `dev` for dev builds (manual — not automated by this CLI).
   */
  devBranch: 'dev',

  remote: 'origin',

  /**
   * Path(s) treated as feature-specific code. Everything outside is shared/common.
   * Accepts a single string or an array.
   * @example 'src/features'
   * @example ['src/features', 'src/apps']
   */
  featurePath: 'src/features',

  /**
   * Directories skipped when detecting common changes (submodules, vendored tooling, …).
   * @example ['service-worker-api', 'packages/git-workflows']
   */
  commonExcludePaths: [],

  /**
   * Individual files skipped when detecting common changes (build artifacts, local-only config).
   * @example ['public/version.json', 'git-controls.config.json']
   */
  commonExcludeFiles: [],

  commonBranchPrefix: 'common',

  protectedBranches: ['root', 'dev', 'main', 'master', 'develop'],

  mergeRequestProvider: 'gitlab',

  syncStrategy: 'merge',
});
