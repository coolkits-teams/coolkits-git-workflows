// ─── Architecture ─────────────────────────────────────────────────────────────

/**
 * Supported git workflow architectures.
 * Each preset ships its own branch-role defaults; individual fields in
 * git-controls.config.json always win over the preset.
 */
export type ArchitecturePreset =
  | 'feature-based' // main+dev model — extract-common / sync-from-main
  | 'env-flow' //      main/dev/qa/uat + feature/fixbug/hotfix/common
  | 'gitflow' //       main+develop+feature/release/hotfix
  | 'github-flow' //   main+feature/* — PR-based, short-lived
  | 'gitlab-flow' //   main+feature/*, env branches (staging/production)
  | 'trunk-based' //   main only + feature flags, very short branches
  | 'monorepo'; //     scope-aware feature/* branches → main

/** Semver bump level for a commit type. */
export type SemverBump = 'major' | 'minor' | 'patch' | 'none';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface Config {
  /** Workflow preset. Drives defaults for every branch-role field below. */
  readonly architecture: ArchitecturePreset;

  // ── Branch names (all override the chosen preset's defaults) ──────────────

  /** Canonical production / source-of-truth branch. extract-common MRs target this. */
  readonly mainBranch: string;
  /** Integration branch for in-progress work. Gitflow: develop. */
  readonly developBranch: string;
  /** Dev-build integration branch (feature-based / env-flow). */
  readonly devBranch: string;
  /** Staging environment branch (gitlab-flow). */
  readonly stagingBranch: string;
  /** Production environment branch (gitlab-flow). */
  readonly productionBranch: string;
  /** QA environment branch (env-flow). */
  readonly qaBranch: string;
  /** UAT / pre-production branch (env-flow). Hotfix branches base off this. */
  readonly uatBranch: string;

  /**
   * Optional extra environment or long-lived branches (e.g. `"lts": "lts"`).
   * Documented in config; wire into workflows via `baseBranchByBranchType` / `--from`.
   */
  readonly additionalBranches: Readonly<Record<string, string>>;

  // ── Branch prefixes ────────────────────────────────────────────────────────

  /** Prefix for feature branches (e.g. "feature" → "feature/my-thing"). */
  readonly featureBranchPrefix: string;
  /** Prefix for release branches (gitflow). */
  readonly releaseBranchPrefix: string;
  /** Prefix for hotfix branches (gitflow). */
  readonly hotfixBranchPrefix: string;
  /** Prefix for sprint fixbug branches (env-flow). */
  readonly fixbugBranchPrefix: string;
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
  /** Strategy used when syncing main into the feature branch (sync-from-main). */
  readonly syncStrategy: 'merge' | 'rebase';

  // ── Message formats (template strings with {placeholder} tokens) ───────────

  /**
   * MR title for `create-mr` / `finish-branch` (direct push, no --checkout).
   * Placeholders: {sourceBranch}, {targetBranch}, {mrBranch}, {timestamp}, {architecture}
   */
  readonly createMrTitleFormat: string;
  /**
   * MR title for `create-mr --checkout` (safe MR branch).
   * Placeholders: same as createMrTitleFormat
   */
  readonly createMrTitleCheckoutFormat: string;
  /**
   * MR title for `extract-common`.
   * Placeholders: {featureBranch}, {commonBranch}, {mainBranch}, {timestamp}, {fileCount}
   */
  readonly extractCommonMrTitleFormat: string;
  /**
   * Commit subject (first line) for `extract-common`.
   * Placeholders: {featureBranch}, {commonBranch}, {mainBranch}, {timestamp}, {fileCount}
   */
  readonly extractCommonCommitSubjectFormat: string;
  /**
   * Suggested merge commit when merging common MR into main.
   * Placeholders: {featureBranch}, {commonBranch}, {mainBranch}, {timestamp}, {fileCount}
   */
  readonly extractCommonMainMergeFormat: string;

  // ── Branch name formats (template strings with {placeholder} tokens) ───────

  /**
   * Common branch name for `extract-common`.
   * Placeholders: {commonBranchPrefix}, {featureBranch}, {featureSlug}, {timestamp}
   */
  readonly commonBranchFormat: string;
  /**
   * Safe MR branch for `create-mr --checkout`.
   * Placeholders: {mrBranchPrefix}, {sourceBranch}, {sourceSlug}, {targetBranch}, {timestamp}
   */
  readonly mrBranchFormat: string;
  /**
   * Feature branch for `start-branch --type feature`.
   * Placeholders: {featureBranchPrefix}, {name}, {nameSlug}
   */
  readonly featureBranchFormat: string;
  /**
   * Release branch for `start-branch --type release`.
   * Placeholders: {releaseBranchPrefix}, {name}, {nameSlug}
   */
  readonly releaseBranchFormat: string;
  /**
   * Hotfix branch for `start-branch --type hotfix`.
   * Placeholders: {hotfixBranchPrefix}, {name}, {nameSlug}
   */
  readonly hotfixBranchFormat: string;
  /** Fix branch for `start-branch --type fix`. Placeholders: {name}, {nameSlug} */
  readonly fixBranchFormat: string;
  /** Chore branch for `start-branch --type chore`. Placeholders: {name}, {nameSlug} */
  readonly choreBranchFormat: string;
  /**
   * Backup tag before `sync-from-main` merge.
   * Placeholders: {branch}, {branchSlug}, {timestamp}
   */
  readonly syncBackupTagFormat: string;
  /**
   * Sprint fixbug branch for `start-branch --type fixbug`.
   * Placeholders: {fixbugBranchPrefix}, {name}, {nameSlug}
   */
  readonly fixbugBranchFormat: string;

  // ── Commit & versioning conventions ────────────────────────────────────────

  /**
   * Conventional commit subject template.
   * Placeholders: {type}, {scope}, {ticketId}, {description}
   * Default: `{type}({scope}) {ticketId}: {description}`
   */
  readonly commitMessageFormat: string;
  /** Default commit type per branch prefix key (feature → feat, fixbug → fix, …). */
  readonly commitTypeByBranchPrefix: Readonly<Partial<Record<string, string>>>;
  /** Default MR target branch per source prefix key (feature → dev, fixbug → qa, …). */
  readonly mrTargetByBranchPrefix: Readonly<Partial<Record<string, string>>>;
  /** Override base branch per start-branch type (e.g. hotfix → uat). */
  readonly baseBranchByBranchType: Readonly<Partial<Record<string, string>>>;
  /**
   * Semver bump hint per commit type (feat → minor, fix → patch, refactor → none, …).
   * Used in CLI hints; bumping is manual unless you add automation later.
   */
  readonly semverBumpByCommitType: Readonly<Partial<Record<string, SemverBump>>>;
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
  /** Short description slug for common branch (e.g. fix-validator-null-check). */
  desc?: string | null;
  /** Jira/ticket id (e.g. PROJ-123). */
  ticketId?: string | null;
  scope?: string | null;
  type?: string | null;
  dryRun?: boolean;
  skipMergeRequest?: boolean;
}

export interface ExtractResult {
  status: 'extracted' | 'noop';
  commonBranch?: string;
  files?: string[];
}

// sync-from-main (workflow file: sync-from-root.ts)

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
export type BranchType = 'feature' | 'fixbug' | 'release' | 'hotfix' | 'fix' | 'chore';

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
  /** Short name / slug appended after the prefix (e.g. "contract-management"). */
  name: string;
  /** Override the auto-detected base branch. */
  from?: string | null;
  /** Push the new branch to remote immediately. Default: true. */
  push?: boolean;
  /** Suggested ticket id for commit messages (e.g. PROJ-123). */
  ticketId?: string | null;
  /** Suggested commit scope (defaults to name slug). */
  scope?: string | null;
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
