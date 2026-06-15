import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { createGitClient } from '../core/git-client.js';
import type { Logger } from '../types.js';

export interface ChangelogOptions {
  /** Starting ref (tag/commit). Default: auto-detect last tag. */
  from?: string | null;
  /** Ending ref. Default: HEAD. */
  to?: string | null;
  /** Write to this file instead of stdout. */
  output?: string | null;
  /** Prepend into existing file instead of overwriting. */
  prepend?: boolean;
}

export interface ChangelogEntry {
  type: string;
  scope?: string;
  message: string;
  hash: string;
  breaking?: string;
}

export interface ChangelogResult {
  status: 'generated' | 'empty';
  content?: string;
  outputFile?: string;
}

const TYPE_ORDER = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'chore',
  'style',
  'ci',
  'build',
  'other',
];

const TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  perf: 'Performance Improvements',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  chore: 'Chores',
  style: 'Style',
  ci: 'CI',
  build: 'Build',
  other: 'Other Changes',
};

export function runChangelogWorkflow({
  logger,
  options = {},
}: {
  logger: Logger;
  options?: ChangelogOptions;
}): ChangelogResult {
  const git = createGitClient();

  // Determine range
  let fromRef = options.from?.trim() ?? null;
  if (!fromRef) {
    const lastTag = git.run(['describe', '--tags', '--abbrev=0']).stdout.trim();
    if (lastTag) {
      fromRef = lastTag;
      logger.info(`Auto-detected last tag: ${lastTag}`);
    } else {
      logger.info('No tags found — generating changelog from entire history.');
    }
  }

  const toRef = options.to?.trim() ?? 'HEAD';
  const range = fromRef ? `${fromRef}..${toRef}` : toRef;

  logger.info(`Changelog range: ${range}`);

  const rawLog = git.run(['log', range, '--format=%H\t%s\t%b', '--no-merges']).stdout.trim();

  if (!rawLog) {
    logger.warn('No commits found in the specified range.');
    return { status: 'empty' };
  }

  const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

  const entries: ChangelogEntry[] = rawLog
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const tabIdx = line.indexOf('\t');
      const hash = line.slice(0, 7);
      const rest = line.slice(tabIdx + 1);
      const bodyTabIdx = rest.indexOf('\t');
      const subject = bodyTabIdx >= 0 ? rest.slice(0, bodyTabIdx) : rest;
      const body = bodyTabIdx >= 0 ? rest.slice(bodyTabIdx + 1) : '';

      const match = CONVENTIONAL_RE.exec(subject);
      if (match) {
        const matchType = match[1] ?? 'other';
        const matchScope = match[2];
        const matchMsg = match[4] ?? subject;
        const isBreaking = match[3] === '!' || body.includes('BREAKING CHANGE:');
        const breakingNote = isBreaking
          ? (/BREAKING CHANGE:\s*(.+)/.exec(body)?.[1] ?? matchMsg)
          : undefined;
        const entry: ChangelogEntry = {
          type: matchType,
          message: matchMsg,
          hash,
        };
        if (matchScope) entry.scope = matchScope;
        if (breakingNote) entry.breaking = breakingNote;
        return entry;
      }
      return { type: 'other', message: subject, hash };
    });

  // Separate breaking changes
  const breaking = entries.filter((e) => e.breaking);

  // Group by type
  const grouped: Record<string, ChangelogEntry[]> = {};
  for (const entry of entries) {
    const key = TYPE_ORDER.includes(entry.type) ? entry.type : 'other';
    grouped[key] ??= [];
    grouped[key].push(entry);
  }

  // Build markdown
  const today = new Date().toISOString().slice(0, 10);
  const versionLabel = options.to && options.to !== 'HEAD' ? options.to : 'Unreleased';

  const lines: string[] = [`## [${versionLabel}] — ${today}`, ''];

  if (breaking.length > 0) {
    lines.push('### ⚠ Breaking Changes', '');
    for (const e of breaking) {
      const scope = e.scope ? `**${e.scope}**: ` : '';
      lines.push(`- ${scope}${e.breaking ?? e.message} (\`${e.hash}\`)`);
    }
    lines.push('');
  }

  for (const type of TYPE_ORDER) {
    const group = grouped[type];
    if (!group || group.length === 0) continue;
    lines.push(`### ${TYPE_LABELS[type] ?? type}`, '');
    for (const e of group) {
      const scope = e.scope ? `**${e.scope}**: ` : '';
      lines.push(`- ${scope}${e.message} (\`${e.hash}\`)`);
    }
    lines.push('');
  }

  const content = lines.join('\n');

  if (options.output) {
    if (options.prepend && existsSync(options.output)) {
      const existing = readFileSync(options.output, 'utf8');
      // Insert after the first '---' separator if present, otherwise prepend
      const separatorIdx = existing.indexOf('\n---\n');
      const insertPoint = separatorIdx >= 0 ? separatorIdx + 5 : 0;
      const newContent =
        existing.slice(0, insertPoint) + '\n' + content + '\n' + existing.slice(insertPoint);
      writeFileSync(options.output, newContent, 'utf8');
    } else {
      writeFileSync(options.output, content, 'utf8');
    }
    logger.ok(`Changelog written to: ${options.output}`);
  } else {
    logger.plain('');
    logger.plain(content);
  }

  const result: ChangelogResult = { status: 'generated', content };
  if (options.output) result.outputFile = options.output;
  return result;
}
