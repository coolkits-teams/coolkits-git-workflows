import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

import type { Config } from '../types.js';
import { DEFAULT_CONFIG } from './default-config.js';

const CONFIG_FILE_CANDIDATES = [
  'git-controls.config.js',
  'git-controls.config.mjs',
  'git-controls.config.json',
  '.git-controlsrc.json',
] as const;

/**
 * Resolve the effective configuration by merging built-in defaults with an
 * optional project-level override discovered from `cwd`.
 *
 * Lookup order (first match wins):
 *   1. git-controls.config.js
 *   2. git-controls.config.mjs
 *   3. git-controls.config.json
 *   4. .git-controlsrc.json
 */
export async function loadConfig({ cwd = process.cwd() } = {}): Promise<Readonly<Config>> {
  const override = await loadProjectOverride(cwd);
  return Object.freeze({ ...DEFAULT_CONFIG, ...override });
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
