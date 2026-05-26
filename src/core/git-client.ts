import { spawnSync } from 'child_process';

import type { GitClient, GitRunOptions, GitRunResult } from '../types.js';

export function createGitClient({ cwd }: { cwd?: string } = {}): GitClient {
  const run = (args: string[], options: GitRunOptions = {}): GitRunResult => {
    const result = spawnSync('git', args, {
      encoding: 'utf8',
      stdio: options.stdio ?? 'pipe',
      cwd: options.cwd ?? cwd,
    });

    if (result.error) {
      throw new Error(`Failed to spawn git: ${result.error.message}`);
    }

    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr.trim(),
    };
  };

  const runOrThrow = (args: string[], options: GitRunOptions = {}): string => {
    const result = run(args, options);
    if (!result.ok) {
      throw new Error(`Command failed: git ${args.join(' ')}\n${result.stderr}`);
    }
    return result.stdout;
  };

  return { run, runOrThrow };
}
