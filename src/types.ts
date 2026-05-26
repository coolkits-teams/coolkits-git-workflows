// ─── Architecture ─────────────────────────────────────────────────────────────

/**
 * Supported git workflow architectures.
 * Each preset ships its own branch-role defaults; individual fields in
 * git-controls.config.json always win over the preset.
 */
export type ArchitecturePreset =
  | 'feature-based' // root+dev model — extract-common / sync-from-root
  | 'gitflow' //       main+develop+feature/release/hotfix
  | 'github-flow' //   main+feature/* — PR-based, short-lived
  | 'gitlab-flow' //   main+feature/*, env branches (staging/production)
  | 'trunk-based' //   main only + feature flags, very short branches
  | 'monorepo'; //     scope-aware feature/* branches → main

// ─── Configuration ────────────────────────────────────────────────────────────

export interface Config {
  /** Workflow preset. Drives defaults for every branch-role field below. */
  readonly architecture: ArchitecturePreset;

  // ── Branch names (all override the chosen preset's defaults) ──────────────

  /** Canonical production branch (main/master). */
  readonly mainBranch: string;
  /** Integration branch for in-progress work. Gitflow: develop. */
  readonly developBranch: string;
  /** Common-source branch for feature-based. extract-common MRs target this. */
  readonly rootBranch: string;
  /** Dev-build integration branch for feature-based. */
  readonly devBranch: string;
  /** Staging environment branch (gitlab-flow). */
  readonly stagingBranch: string;
  /** Production environment branch (gitlab-flow). */
  readonly productionBranch: string;

  // ── Branch prefixes ────────────────────────────────────────────────────────

  /** Prefix for feature branches (e.g. "feature" → "feature/my-thing"). */
  readonly featureBranchPrefix: string;
  /** Prefix for release branches (gitflow). */
  readonly releaseBranchPrefix: string;
  /** Prefix for hotfix branches (gitflow). */
  readonly hotfixBranchPrefix: string;
  /** Prefix for generated common branches (feature-based). */
  readonly commonBranchPrefix: string;
  /** Prefix for safe MR branches created by git-create-mr --checkout. */
  readonly mrBranchPrefix: string;

  // ── Feature-based specific ─────────────────────────────────────────────────

  /** Path(s) treated as feature-specific. Everything outside is shared/common. */
  readonly featurePath: string | string[];
  /** Directory paths excluded from common extract. */
  readonly commonExcludePaths: string | string[];
  /** Individual file paths excluded from common extract. */
  readonly commonExcludeFiles: string | string[];

  // ── Shared ────────────────────────────────────────────────────────────────

  /** Git remote name. */
  readonly remote: string;
  /** Branches the CLI refuses to operate on as a feature/source branch. */
  readonly protectedBranches: string[];
  /** MR/PR provider. 'gitlab' → glab CLI, 'github' → gh CLI, 'none' → URL only. */
  readonly mergeRequestProvider: 'gitlab' | 'github' | 'none';
  /** Strategy used when syncing root into the feature branch. */
  readonly syncStrategy: 'merge' | 'rebase';
}

// ─── Git Client ───────────────────────────────────────────────────────────────

export interface GitRunOptions {
  cwd?: string;
  stdio?: 'pipe' | 'inherit';
}

export interface GitRunResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface GitClient {
  run(args: string[], options?: GitRunOptions): GitRunResult;
  runOrThrow(args: string[], options?: GitRunOptions): string;
}

// ─── Branch Resolver ──────────────────────────────────────────────────────────

export interface BranchResolver {
  resolve(explicitBranch?: string | null): string;
  ensureFeatureBranch(branch: string): void;
  ensureRemoteExists(branch: string): void;
  checkout(branch: string): void;
}

// ─── Working Tree ─────────────────────────────────────────────────────────────

export interface WorkingTreeInspector {
  isGitRepository(): boolean;
  listDirtyTrackedFiles(): string[];
  assertClean(): void;
}

// ─── Logger ───────────────────────────────────────────────────────────────────

export interface Logger {
  info(message: string): void;
  ok(message: string): void;
  warn(message: string): void;
  err(message: string): void;
  debug(message: string): void;
  plain(message: string): void;
}

// ─── MR / PR Provider ─────────────────────────────────────────────────────────

export interface MergeRequestParams {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  cwd: string;
}

export interface MergeRequestResult {
  ok: boolean;
  reason?: string;
  url: string;
}

export interface MrProvider {
  createMergeRequest(params: MergeRequestParams): MergeRequestResult;
  buildMergeRequestUrl(sourceBranch: string, targetBranch: string): string;
}

// ─── Workflow Options & Results ───────────────────────────────────────────────

// extract-common

export interface ExtractOptions {
  branch?: string | null;
  dryRun?: boolean;
  skipMergeRequest?: boolean;
}

export interface ExtractResult {
  status: 'extracted' | 'noop';
  commonBranch?: string;
  files?: string[];
}

// sync-from-root

export interface SyncOptions {
  branch?: string | null;
  skipPush?: boolean;
}

export interface SyncResult {
  status: 'synced' | 'up-to-date';
  backupTag?: string;
}

// create-mr

/** Branch types recognised by start/finish-branch commands. */
export type BranchType = 'feature' | 'release' | 'hotfix' | 'fix' | 'chore';

export interface CreateMrOptions {
  /** Source branch. Default: current branch. */
  source?: string | null;
  /**
   * Target branch for the MR.
   * Default: architecture-aware (devBranch for feature-based, mainBranch for others).
   */
  target?: string | null;
  /** MR/PR title. Default: auto-generated from source + target. */
  title?: string | null;
  /**
   * Create a dedicated MR branch before pushing.
   * Keeps the original source branch clean and lets you resolve conflicts
   * without polluting your feature branch.
   */
  checkout?: boolean;
  /**
   * When --checkout is enabled, the new MR branch can be based on:
   * - 'source' (default): copy of the source branch — safe, no conflicts yet
   * - 'target': created from the target branch then merged from source —
   *             surfaces conflicts locally so you can resolve before pushing
   */
  checkoutBase?: 'source' | 'target';
  dryRun?: boolean;
  skipPush?: boolean;
}

export interface CreateMrResult {
  status: 'created' | 'conflict' | 'dry-run';
  sourceBranch: string;
  targetBranch: string;
  mrBranch: string;
  url?: string;
}

// start-branch

export interface StartBranchOptions {
  /** Branch type. Default: 'feature'. */
  type?: BranchType;
  /** Short name / slug appended after the prefix (e.g. "user-auth"). */
  name: string;
  /** Override the auto-detected base branch. */
  from?: string | null;
  /** Push the new branch to remote immediately. Default: true. */
  push?: boolean;
}

export interface StartBranchResult {
  status: 'created';
  branch: string;
  basedOn: string;
}

// finish-branch

export interface FinishBranchOptions {
  /** Branch to finish. Default: current branch. */
  branch?: string | null;
  /**
   * Override the target branch for the MR.
   * Default: architecture-aware (developBranch for gitflow feature, mainBranch otherwise).
   */
  target?: string | null;
  /** Skip MR creation; only push the branch. */
  skipMr?: boolean;
  dryRun?: boolean;
}

export interface FinishBranchResult {
  status: 'mr-created' | 'pushed' | 'dry-run';
  branch: string;
  targetBranch: string;
  additionalTargets?: string[]; // gitflow release/hotfix: also needs develop
}

// generic param container

export interface WorkflowParams<TOptions> {
  config: Config;
  logger: Logger;
  options?: TOptions;
}
