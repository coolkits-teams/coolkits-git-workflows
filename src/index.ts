/**
 * Public API for programmatic use of @coolkits/git-workflows.
 *
 * @example
 * ```ts
 * import { loadConfig, createLogger, runExtractCommonWorkflow } from '@coolkits/git-workflows';
 *
 * const config = await loadConfig();
 * const logger = createLogger();
 * runExtractCommonWorkflow({ config, logger, options: { dryRun: true } });
 * ```
 */

export {
  ARCHITECTURE_PRESETS,
  getArchitecturePreset,
  isValidArchitecture,
} from './config/architecture-presets.js';
export { DEFAULT_CONFIG } from './config/default-config.js';
export { loadConfig } from './config/load-config.js';

export { createLogger } from './utils/logger.js';
export { parseCliArgs } from './utils/cli-args.js';
export {
  buildCommonPathspec,
  directoryExcludePathspec,
  fileExcludePathspec,
  normalizePathList,
  normalizeRepoPath,
} from './utils/common-pathspec.js';

export { createGitClient } from './core/git-client.js';
export { createBranchResolver } from './core/branch-resolver.js';
export { createWorkingTreeInspector } from './core/working-tree.js';
export {
  classifyConflictFile,
  detectOwnedFeatureDirs,
  listConflictedFiles,
  takeRootVersion,
} from './core/feature-scope.js';
export type { ConflictOwnership } from './core/feature-scope.js';

export { createGitLabProvider } from './providers/gitlab-provider.js';
export { createGitHubProvider } from './providers/github-provider.js';
export { createMrProvider } from './providers/mr-provider.js';

export { runExtractCommonWorkflow } from './workflows/extract-common.js';
export { runSyncFromRootWorkflow } from './workflows/sync-from-root.js';
export { runCreateMrWorkflow } from './workflows/create-mr.js';
export { runStartBranchWorkflow } from './workflows/start-branch.js';
export { runFinishBranchWorkflow } from './workflows/finish-branch.js';
export { runReleaseUatWorkflow } from './workflows/release-uat.js';
export { runFinalReleaseSyncWorkflow } from './workflows/final-release-sync.js';

export { GitControlsError } from './errors.js';

export type {
  ArchitecturePreset,
  BranchType,
  Config,
  GitClient,
  GitRunOptions,
  GitRunResult,
  BranchResolver,
  WorkingTreeInspector,
  Logger,
  MrProvider,
  MergeRequestParams,
  MergeRequestResult,
  ExtractOptions,
  ExtractResult,
  SyncOptions,
  SyncResult,
  CreateMrOptions,
  CreateMrResult,
  StartBranchOptions,
  StartBranchResult,
  FinishBranchOptions,
  FinishBranchResult,
  ReleaseUatOptions,
  ReleaseUatResult,
  FinalReleaseSyncOptions,
  FinalReleaseSyncResult,
  WorkflowParams,
} from './types.js';
