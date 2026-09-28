import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd();
}

export function initBareRepo(dir: string): void {
  git(dir, ['init', '--bare']);
}

export function initRepo(dir: string): void {
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'dev@example.com']);
  git(dir, ['config', 'user.name', 'Dev']);
  git(dir, ['commit', '--allow-empty', '-m', 'root']);
}

export function writeRepoFile(dir: string, relativePath: string, content: string): void {
  const fullPath = join(dir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

export function commitFile(
  dir: string,
  relativePath: string,
  content: string,
  message: string,
): string {
  writeRepoFile(dir, relativePath, content);
  git(dir, ['add', relativePath]);
  git(dir, ['commit', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

export function commitFiles(dir: string, files: Record<string, string>, message: string): string {
  for (const [relativePath, content] of Object.entries(files)) {
    writeRepoFile(dir, relativePath, content);
    git(dir, ['add', relativePath]);
  }
  git(dir, ['commit', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

export interface TempGitRepo {
  dir: string;
  cleanup: () => void;
}

export function createTempGitRepo(prefix = 'coolkit-test-'): TempGitRepo {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Clone, add origin remote, and push branches so coolkit can resolve origin/<branch>. */
export function publishBranches(repoDir: string, branches: string[]): void {
  const remoteDir = mkdtempSync(join(tmpdir(), 'coolkit-remote-'));
  initBareRepo(remoteDir);
  git(repoDir, ['remote', 'add', 'origin', remoteDir]);
  for (const branch of branches) {
    git(repoDir, ['push', '-u', 'origin', branch]);
  }
}
