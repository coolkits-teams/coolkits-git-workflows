import type { Config } from '../types.js';

/** Convert a branch name into a safe slug for generated branch names and tags. */
export function slugifyBranchName(branch: string): string {
  return branch
    .replace(/^refs\/heads\//, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function formatExtractTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

export function buildCommonBranchName(
  featureBranch: string,
  timestamp: string,
  config: Pick<Config, 'commonBranchPrefix'>,
): string {
  const slug = slugifyBranchName(featureBranch);
  return `${config.commonBranchPrefix}/${slug}-${timestamp}`;
}

export function buildExtractCommitSubject(featureBranch: string, timestamp: string): string {
  return `common: extract from ${featureBranch} (${timestamp})`;
}

export function buildMergeRequestTitle(featureBranch: string, timestamp: string): string {
  return `[${featureBranch}] common → root (${timestamp})`;
}

export function buildSuggestedRootMergeMessage(
  featureBranch: string,
  commonBranch: string,
): string {
  return `common: merge shared changes from ${featureBranch} (${commonBranch} → root)`;
}

export function buildExtractCommitMessage({
  featureBranch,
  commonBranch,
  timestamp,
  changedFiles,
  mergeBase,
  rootBranch,
}: {
  featureBranch: string;
  commonBranch: string;
  timestamp: string;
  changedFiles: string[];
  mergeBase: string;
  rootBranch: string;
}): string {
  return [
    buildExtractCommitSubject(featureBranch, timestamp),
    '',
    'Auto-extracted by @coolkits/git-workflows (extract-common workflow).',
    `Feature branch: ${featureBranch}`,
    `Common branch:  ${commonBranch}`,
    `Merge target:   ${rootBranch}`,
    `Files changed:  ${changedFiles.length.toString()}`,
    `Merge-base:     ${mergeBase}`,
    '',
    `Suggested merge commit when merging into ${rootBranch}:`,
    buildSuggestedRootMergeMessage(featureBranch, commonBranch),
  ].join('\n');
}

export function buildMergeRequestDescription({
  featureBranch,
  commonBranch,
  changedFiles,
  mergeBase,
  rootBranch,
}: {
  featureBranch: string;
  commonBranch: string;
  changedFiles: string[];
  mergeBase: string;
  rootBranch: string;
}): string {
  return [
    `Auto-extracted common changes from \`${featureBranch}\`.`,
    '',
    `**Feature branch:** \`${featureBranch}\``,
    `**Common branch:** \`${commonBranch}\``,
    `**Merge target:** \`${rootBranch}\``,
    `**Files changed:** ${changedFiles.length.toString()}`,
    `**Merge-base:** \`${mergeBase}\``,
    '',
    'When merging this MR into `root`, keep the feature branch in the merge commit message:',
    '',
    '```',
    buildSuggestedRootMergeMessage(featureBranch, commonBranch),
    '```',
    '',
    '<details><summary>File list</summary>',
    '',
    '```',
    changedFiles.join('\n'),
    '```',
    '</details>',
  ].join('\n');
}
