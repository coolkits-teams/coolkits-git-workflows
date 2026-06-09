import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GitClient } from '../types.js';

/** Which merge side holds the source-of-truth ("root") content. */
export type RootSide = 'ours' | 'theirs';

/** One conflict region of a diff3-style merged file. */
interface ConflictHunk {
  ours: string;
  base: string;
  theirs: string;
}

type Segment = { type: 'text'; content: string } | { type: 'conflict'; hunk: ConflictHunk };

/** Per-file outcome of {@link resolveModifyConflict}. */
export type HunkResolution = 'kept-root' | 'merged-both' | 'unresolved';

/** File extensions where merging both additions (Case 2) is structurally safe. */
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);

/**
 * Matches a top-level TS/JS declaration so we can detect duplicate symbols when
 * keeping both sides of an additive conflict. Heuristic (not a full parser) — good
 * enough to catch `export const X`, `function X`, `type X`, `interface X`, etc.
 */
const DECLARATION_RE =
  /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

function isCodeFile(file: string): boolean {
  const dot = file.lastIndexOf('.');
  if (dot === -1) return false;
  return CODE_EXTENSIONS.has(file.slice(dot));
}

function extractDeclaredSymbols(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(DECLARATION_RE)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/**
 * Split a diff3-marked file into plain-text and conflict segments.
 *
 * Relies on diff3 markers: `<<<<<<<` (ours), `|||||||` (base), `=======`, `>>>>>>>`.
 * Returns `null` when the file has no conflict markers at all.
 */
function parseDiff3(content: string): Segment[] | null {
  const lines = content.split('\n');
  const segments: Segment[] = [];
  let buffer: string[] = [];
  let hasConflict = false;

  const flushText = (): void => {
    if (buffer.length > 0) {
      segments.push({ type: 'text', content: buffer.join('\n') });
      buffer = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.startsWith('<<<<<<<')) {
      hasConflict = true;
      flushText();

      const ours: string[] = [];
      const base: string[] = [];
      const theirs: string[] = [];
      let phase: 'ours' | 'base' | 'theirs' = 'ours';
      i += 1;

      while (i < lines.length && !(lines[i] ?? '').startsWith('>>>>>>>')) {
        const inner = lines[i] ?? '';
        if (inner.startsWith('|||||||')) {
          phase = 'base';
        } else if (inner.startsWith('=======')) {
          phase = 'theirs';
        } else if (phase === 'ours') {
          ours.push(inner);
        } else if (phase === 'base') {
          base.push(inner);
        } else {
          theirs.push(inner);
        }
        i += 1;
      }
      // Skip the closing >>>>>>> line.
      i += 1;

      segments.push({
        type: 'conflict',
        hunk: {
          ours: ours.join('\n'),
          base: base.join('\n'),
          theirs: theirs.join('\n'),
        },
      });
      continue;
    }

    buffer.push(line);
    i += 1;
  }

  flushText();
  return hasConflict ? segments : null;
}

function pickRoot(hunk: ConflictHunk, rootSide: RootSide): string {
  return rootSide === 'ours' ? hunk.ours : hunk.theirs;
}

function pickOther(hunk: ConflictHunk, rootSide: RootSide): string {
  return rootSide === 'ours' ? hunk.theirs : hunk.ours;
}

/**
 * Join two non-empty code blocks, keeping root first. Drops empty blocks so we never
 * introduce stray blank lines.
 */
function joinBoth(rootText: string, otherText: string): string {
  const parts = [rootText, otherText].filter((part) => part.trim().length > 0);
  return parts.join('\n');
}

/**
 * Resolve a "both modified" (UU) file hunk-by-hunk, prioritising root:
 *
 * - Hunk whose diff3 base is NON-empty → both sides edited shared code → keep root.
 * - Hunk whose diff3 base is empty → both sides ADDED code at adjacent lines →
 *   keep BOTH, unless the non-root side declares a symbol that already exists in the
 *   root file (duplicate function/type/var) → then keep root only.
 * - Non-code files never merge both (would break structure) → keep root.
 *
 * Regenerates diff3 markers via `git checkout --conflict=diff3` so the base section is
 * always present regardless of the user's `merge.conflictStyle`.
 */
export function resolveModifyConflict({
  git,
  file,
  rootSide,
  repoRoot,
}: {
  git: GitClient;
  file: string;
  rootSide: RootSide;
  repoRoot: string;
}): HunkResolution {
  git.runOrThrow(['checkout', '--conflict=diff3', '--', file]);

  const absPath = join(repoRoot, file);
  const content = readFileSync(absPath, 'utf8');
  const segments = parseDiff3(content);

  if (!segments) return 'kept-root';

  const rootStage = rootSide === 'ours' ? '2' : '3';
  const rootFileContent = git.run(['show', `:${rootStage}:${file}`]).stdout;
  const rootSymbols = extractDeclaredSymbols(rootFileContent);
  const codeFile = isCodeFile(file);

  let mergedBoth = false;

  const resolvedLines: string[] = [];

  for (const segment of segments) {
    if (segment.type === 'text') {
      resolvedLines.push(segment.content);
      continue;
    }

    const { hunk } = segment;
    const rootText = pickRoot(hunk, rootSide);
    const otherText = pickOther(hunk, rootSide);
    const otherSymbols = extractDeclaredSymbols(otherText);

    // Case 2 — pure addition (no common-ancestor content): both sides inserted code.
    if (hunk.base.trim().length === 0) {
      if (!codeFile) {
        resolvedLines.push(rootText);
        continue;
      }
      const hasDuplicate = [...otherSymbols].some((name) => rootSymbols.has(name));
      if (hasDuplicate) {
        // Same symbol declared on both sides → keep root, drop the duplicate.
        resolvedLines.push(rootText);
        continue;
      }
      mergedBoth = true;
      otherSymbols.forEach((name) => rootSymbols.add(name));
      resolvedLines.push(joinBoth(rootText, otherText));
      continue;
    }

    // Case 1 — common-ancestor content exists → both edited shared code. Keep root,
    // BUT if the non-root side also introduces a net-new symbol in the same hunk
    // (modify + add tangled together with no separating anchor), auto-keeping root
    // would silently drop that new code. That is ambiguous — defer to the developer.
    const baseSymbols = extractDeclaredSymbols(hunk.base);
    const introducesNetNew = codeFile
      ? [...otherSymbols].some((name) => !baseSymbols.has(name) && !rootSymbols.has(name))
      : false;
    if (introducesNetNew) {
      return 'unresolved';
    }
    resolvedLines.push(rootText);
  }

  const resolved = resolvedLines.join('\n');

  if (resolved.includes('<<<<<<<') || resolved.includes('>>>>>>>')) {
    return 'unresolved';
  }

  writeFileSync(absPath, resolved, 'utf8');
  git.runOrThrow(['add', '--', file]);

  return mergedBoth ? 'merged-both' : 'kept-root';
}
