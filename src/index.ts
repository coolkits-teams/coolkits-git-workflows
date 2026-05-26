/**
 * Public API for programmatic use of @coolkits/git-workflows.
 *
 * @example
 * ```ts
 * import { loadConfig, createLogger, runExtractCommonWorkflow } from '@coolkits/git-workflows';
 *
 * const config = await loadConfig();
 * const logger = createLogger();
 * await runExtractCommonWorkflow({ config, logger, options: { dryRun: true } });
 * ```
 */

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

export { createGitLabProvider } from './providers/gitlab-provider.js';

export { runExtractCommonWorkflow } from './workflows/extract-common.js';
export { runSyncFromRootWorkflow } from './workflows/sync-from-root.js';

export { GitControlsError } from './errors.js';

export type {
  Config,
  GitClient,
  GitRunOptions,
  GitRunResult,
  BranchResolver,
  WorkingTreeInspector,
  Logger,
  GitLabProvider,
  MergeRequestParams,
  MergeRequestResult,
  ExtractOptions,
  ExtractResult,
  SyncOptions,
  SyncResult,
  WorkflowParams,
} from './types.js';
