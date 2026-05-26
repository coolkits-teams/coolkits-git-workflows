import type { Config } from '../types.js';

/** Normalize a repo-relative path for git pathspec (forward slashes, no trailing slash). */
export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Coerce a config value into a deduplicated list of normalized paths. */
export function normalizePathList(paths: string | string[] | undefined): string[] {
  if (!paths) return [];

  const normalized = (Array.isArray(paths) ? paths : [paths])
    .map(normalizeRepoPath)
    .filter(Boolean);

  return [...new Set(normalized)];
}

/**
 * Git pathspec entries that exclude a directory and all paths beneath it.
 *
 * @example directoryExcludePathspec('service-worker-api')
 * // → [':(exclude)service-worker-api', ':(exclude)service-worker-api/*']
 */
export function directoryExcludePathspec(directory: string): string[] {
  const dir = normalizeRepoPath(directory);
  if (!dir) return [];

  return [`:(exclude)${dir}`, `:(exclude)${dir}/*`];
}

/**
 * Git pathspec entry that excludes a single file (not its siblings or parent dir).
 *
 * @example fileExcludePathspec('public/version.json')
 * // → [':(exclude)public/version.json']
 */
export function fileExcludePathspec(file: string): string[] {
  const normalized = normalizeRepoPath(file);
  if (!normalized) return [];

  return [`:(exclude)${normalized}`];
}

type CommonPathspecConfig = Pick<Config, 'featurePath'> &
  Partial<Pick<Config, 'commonExcludePaths' | 'commonExcludeFiles'>>;

/**
 * Build the full pathspec array passed to `git diff` during extract-common.
 *
 * Scope: all repo changes except
 * - paths under {@link Config.featurePath} (feature-specific code), and
 * - paths listed in {@link Config.commonExcludePaths} (directories) /
 *   {@link Config.commonExcludeFiles} (individual files).
 */
export function buildCommonPathspec(config: CommonPathspecConfig): string[] {
  const featurePaths = normalizePathList(config.featurePath);
  const excludeDirs = normalizePathList(config.commonExcludePaths);
  const excludeFiles = normalizePathList(config.commonExcludeFiles);

  const exclusions = [
    ...featurePaths.flatMap(directoryExcludePathspec),
    ...excludeDirs.flatMap(directoryExcludePathspec),
    ...excludeFiles.flatMap(fileExcludePathspec),
  ];

  return ['.', ...exclusions];
}
