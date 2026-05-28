import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

import type { Config } from '../types.js';
import { getArchitecturePreset, isValidArchitecture } from './architecture-presets.js';
import { DEFAULT_CONFIG } from './default-config.js';

const CONFIG_FILE_CANDIDATES = [
  'git-controls.config.js',
  'git-controls.config.mjs',
  'git-controls.config.json',
  '.git-controlsrc.json',
] as const;

/**
 * Resolve the effective configuration.
 *
 * Priority order (highest wins):
 *   1. User project config (git-controls.config.json / .js / .mjs / .rc)
 *   2. Architecture preset (driven by `architecture` field)
 *   3. DEFAULT_CONFIG base
 *
 * This means a user can set `"architecture": "gitflow"` and get all gitflow
 * defaults without repeating every branch name, then override any specific
 * field (e.g. `"mainBranch": "master"`) if their repo differs.
 */
export async function loadConfig({ cwd = process.cwd() } = {}): Promise<Readonly<Config>> {
  const userOverride = await loadProjectOverride(cwd);

  // Determine which preset to apply: user override wins over DEFAULT_CONFIG.
  const architecture = isValidArchitecture(userOverride.architecture)
    ? userOverride.architecture
    : DEFAULT_CONFIG.architecture;

  const preset = getArchitecturePreset(architecture);

  // Merge order: base → preset → user override (deep-merge maps)
  return Object.freeze({
    ...DEFAULT_CONFIG,
    ...preset,
    ...userOverride,
    commitTypeByBranchPrefix: {
      ...DEFAULT_CONFIG.commitTypeByBranchPrefix,
      ...userOverride.commitTypeByBranchPrefix,
    },
    mrTargetByBranchPrefix: {
      ...DEFAULT_CONFIG.mrTargetByBranchPrefix,
      ...preset.mrTargetByBranchPrefix,
      ...userOverride.mrTargetByBranchPrefix,
    },
    baseBranchByBranchType: {
      ...DEFAULT_CONFIG.baseBranchByBranchType,
      ...preset.baseBranchByBranchType,
      ...userOverride.baseBranchByBranchType,
    },
    semverBumpByCommitType: {
      ...DEFAULT_CONFIG.semverBumpByCommitType,
      ...userOverride.semverBumpByCommitType,
    },
    additionalBranches: {
      ...DEFAULT_CONFIG.additionalBranches,
      ...userOverride.additionalBranches,
    },
  });
}

type LegacyConfigOverride = Partial<Config> & {
  rootBranch?: string;
  extractCommonRootMergeFormat?: string;
};

function replaceRootBranchPlaceholder(value: string): string {
  return value.replaceAll('{rootBranch}', '{mainBranch}');
}

function normalizeLegacyConfig(raw: LegacyConfigOverride): Partial<Config> {
  const { rootBranch, extractCommonRootMergeFormat, ...rest } = raw;

  const mainBranch =
    rest.mainBranch ?? (rootBranch != null && rootBranch !== '' ? rootBranch : undefined);

  const extractCommonMainMergeFormat =
    rest.extractCommonMainMergeFormat ?? extractCommonRootMergeFormat;

  const extractCommonMrTitleFormat =
    rest.extractCommonMrTitleFormat != null
      ? replaceRootBranchPlaceholder(rest.extractCommonMrTitleFormat)
      : undefined;

  const extractCommonMainMergeFormatNormalized =
    extractCommonMainMergeFormat != null
      ? replaceRootBranchPlaceholder(extractCommonMainMergeFormat)
      : undefined;

  const extractCommonCommitSubjectFormat =
    rest.extractCommonCommitSubjectFormat != null
      ? replaceRootBranchPlaceholder(rest.extractCommonCommitSubjectFormat)
      : undefined;

  const protectedBranches =
    rest.protectedBranches != null ? rest.protectedBranches.filter((b) => b !== 'root') : undefined;

  const mrTargetByBranchPrefix =
    rest.mrTargetByBranchPrefix?.common === 'root'
      ? { ...rest.mrTargetByBranchPrefix, common: 'main' }
      : rest.mrTargetByBranchPrefix;

  return {
    ...rest,
    ...(mainBranch !== undefined && { mainBranch }),
    ...(extractCommonMrTitleFormat !== undefined && { extractCommonMrTitleFormat }),
    ...(extractCommonMainMergeFormatNormalized !== undefined && {
      extractCommonMainMergeFormat: extractCommonMainMergeFormatNormalized,
    }),
    ...(extractCommonCommitSubjectFormat !== undefined && { extractCommonCommitSubjectFormat }),
    ...(protectedBranches !== undefined && { protectedBranches }),
    ...(mrTargetByBranchPrefix !== undefined && { mrTargetByBranchPrefix }),
  };
}

async function loadProjectOverride(cwd: string): Promise<Partial<Config>> {
  for (const candidate of CONFIG_FILE_CANDIDATES) {
    const absolutePath = resolve(cwd, candidate);
    if (!existsSync(absolutePath)) continue;

    if (candidate.endsWith('.json')) {
      const raw = JSON.parse(readFileSync(absolutePath, 'utf8')) as LegacyConfigOverride;
      return normalizeLegacyConfig(raw);
    }

    const mod = (await import(pathToFileURL(absolutePath).href)) as {
      default?: LegacyConfigOverride;
    };
    return normalizeLegacyConfig(mod.default ?? {});
  }

  return {};
}
