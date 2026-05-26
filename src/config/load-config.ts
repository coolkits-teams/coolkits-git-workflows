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

  // Merge order: base → preset → user override
  return Object.freeze({ ...DEFAULT_CONFIG, ...preset, ...userOverride });
}

async function loadProjectOverride(cwd: string): Promise<Partial<Config>> {
  for (const candidate of CONFIG_FILE_CANDIDATES) {
    const absolutePath = resolve(cwd, candidate);
    if (!existsSync(absolutePath)) continue;

    if (candidate.endsWith('.json')) {
      return JSON.parse(readFileSync(absolutePath, 'utf8')) as Partial<Config>;
    }

    const mod = (await import(pathToFileURL(absolutePath).href)) as {
      default?: Partial<Config>;
    };
    return mod.default ?? {};
  }

  return {};
}
