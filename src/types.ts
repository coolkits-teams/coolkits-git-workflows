// ─── Configuration ────────────────────────────────────────────────────────────

export interface Config {
  /** Integration branch for common/shared source. MRs from extract target this branch. */
  readonly rootBranch: string;
  /** Team dev integration branch. Feature MRs for dev builds go here (manual). */
  readonly devBranch: string;
  /** Git remote name (default: 'origin'). */
  readonly remote: string;
  /** Path(s) treated as feature-specific. Everything outside is shared/common code. */
  readonly featurePath: string | string[];
  /** Prefix for generated common branch names: `<prefix>/<slug>-<timestamp>`. */
  readonly commonBranchPrefix: string;
  /** Branches the CLI will refuse to operate on as a feature branch. */
  readonly protectedBranches: string[];
  /** MR provider. 'gitlab' uses glab CLI; 'none' always prints a URL. */
  readonly mergeRequestProvider: 'gitlab' | 'none';
  /** Sync strategy when pulling root into the feature branch. */
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

// ─── GitLab Provider ──────────────────────────────────────────────────────────

export interface MergeRequestParams {
  sourceBranch: string;
  title: string;
  description: string;
  cwd: string;
}

export interface MergeRequestResult {
  ok: boolean;
  reason?: string;
  url: string;
}

export interface GitLabProvider {
  createMergeRequest(params: MergeRequestParams): MergeRequestResult;
  buildMergeRequestUrl(sourceBranch: string): string;
}

// ─── Workflow Options & Results ───────────────────────────────────────────────

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

export interface SyncOptions {
  branch?: string | null;
  skipPush?: boolean;
}

export interface SyncResult {
  status: 'synced' | 'up-to-date';
  backupTag?: string;
}

export interface WorkflowParams<TOptions> {
  config: Config;
  logger: Logger;
  options?: TOptions;
}
