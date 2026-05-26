import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Persist a string payload to a temp file. Returns the absolute path. */
export function writeTempFile(prefix: string, content: string): string {
  const path = join(tmpdir(), `${prefix}-${Date.now().toString()}.tmp`);
  writeFileSync(path, content, 'utf8');
  return path;
}

/** Create a fresh temp directory. Returns the absolute path. */
export function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

/** Best-effort filesystem cleanup — never throws. */
export function safeRemove(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true });
  } catch {
    // Intentionally ignored — cleanup is best effort.
  }
}
