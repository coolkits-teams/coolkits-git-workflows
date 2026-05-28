import type { Config } from '../types.js';

/** Replace `{placeholder}` tokens in a template string. Unknown placeholders are left unchanged. */
function applyMessageTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined) return match;
    return typeof value === 'number' ? value.toString() : value;
  });
}

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

/** Slugify a short name segment (start-branch `--name` argument). */
export function slugifyNameSegment(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildCommonBranchName(
  featureBranch: string,
  timestamp: string,
  config: Pick<Config, 'commonBranchPrefix' | 'commonBranchFormat'>,
  description?: string | null,
): string {
  const featureSlug = slugifyBranchName(featureBranch);
  const descSlug =
    description != null && description.trim() !== ''
      ? slugifyNameSegment(description)
      : featureSlug;
  return applyMessageTemplate(config.commonBranchFormat, {
    commonBranchPrefix: config.commonBranchPrefix,
    featureBranch,
    featureSlug,
    descSlug,
    timestamp,
  });
}

/** Conventional commit subject: `{type}({scope}) {ticketId}: {description}` */
export function buildCommitMessage(
  config: Pick<Config, 'commitMessageFormat'>,
  vars: {
    type: string;
    scope: string;
    ticketId: string;
    description: string;
  },
): string {
  return applyMessageTemplate(config.commitMessageFormat, vars);
}

export function buildMrBranchName(
  sourceBranch: string,
  targetBranch: string,
  timestamp: string,
  config: Pick<Config, 'mrBranchPrefix' | 'mrBranchFormat'>,
): string {
  return applyMessageTemplate(config.mrBranchFormat, {
    mrBranchPrefix: config.mrBranchPrefix,
    sourceBranch,
    sourceSlug: slugifyBranchName(sourceBranch),
    targetBranch,
    timestamp,
  });
}

export function buildStartBranchName(
  type: 'feature' | 'fixbug' | 'release' | 'hotfix' | 'fix' | 'chore',
  name: string,
  config: Pick<
    Config,
    | 'featureBranchFormat'
    | 'fixbugBranchFormat'
    | 'releaseBranchFormat'
    | 'hotfixBranchFormat'
    | 'fixBranchFormat'
    | 'choreBranchFormat'
    | 'featureBranchPrefix'
    | 'fixbugBranchPrefix'
    | 'releaseBranchPrefix'
    | 'hotfixBranchPrefix'
  >,
): string {
  const nameSlug = slugifyNameSegment(name);
  const vars = {
    name,
    nameSlug,
    featureBranchPrefix: config.featureBranchPrefix,
    fixbugBranchPrefix: config.fixbugBranchPrefix,
    releaseBranchPrefix: config.releaseBranchPrefix,
    hotfixBranchPrefix: config.hotfixBranchPrefix,
  };

  const formatByType: Record<typeof type, string> = {
    feature: config.featureBranchFormat,
    fixbug: config.fixbugBranchFormat,
    release: config.releaseBranchFormat,
    hotfix: config.hotfixBranchFormat,
    fix: config.fixBranchFormat,
    chore: config.choreBranchFormat,
  };

  return applyMessageTemplate(formatByType[type], vars);
}

export function buildSyncBackupTag(
  branch: string,
  timestamp: string,
  config: Pick<Config, 'syncBackupTagFormat'>,
): string {
  return applyMessageTemplate(config.syncBackupTagFormat, {
    branch,
    branchSlug: slugifyBranchName(branch),
    timestamp,
  });
}

export function buildExtractCommitSubject(
  featureBranch: string,
  timestamp: string,
  config: Pick<Config, 'extractCommonCommitSubjectFormat' | 'commitMessageFormat' | 'mainBranch'>,
  commonBranch = '',
  fileCount = 0,
  commitVars?: {
    type?: string | null;
    scope?: string | null;
    ticketId?: string | null;
    description?: string | null;
  },
): string {
  if (config.extractCommonCommitSubjectFormat.includes('{type}(')) {
    const vars = commitVars ?? {};
    const scope = vars.scope?.trim() !== '' && vars.scope != null ? vars.scope : 'common';
    const ticketId =
      vars.ticketId?.trim() !== '' && vars.ticketId != null ? vars.ticketId : 'NO-TICKET';
    const description =
      vars.description?.trim() !== '' && vars.description != null
        ? vars.description
        : `extract shared changes from ${featureBranch}`;
    return buildCommitMessage(config, {
      type: vars.type ?? 'chore',
      scope,
      ticketId,
      description,
    });
  }

  return applyMessageTemplate(config.extractCommonCommitSubjectFormat, {
    featureBranch,
    commonBranch,
    mainBranch: config.mainBranch,
    timestamp,
    fileCount,
    descSlug: commonBranch.split('/').pop() ?? featureBranch,
  });
}

export function buildMergeRequestTitle(
  featureBranch: string,
  timestamp: string,
  config: Pick<Config, 'extractCommonMrTitleFormat' | 'mainBranch'>,
  commonBranch = '',
  fileCount = 0,
): string {
  return applyMessageTemplate(config.extractCommonMrTitleFormat, {
    featureBranch,
    commonBranch,
    mainBranch: config.mainBranch,
    timestamp,
    fileCount,
  });
}

export function buildSuggestedMainMergeMessage(
  featureBranch: string,
  commonBranch: string,
  config: Pick<Config, 'extractCommonMainMergeFormat' | 'mainBranch'>,
  timestamp = '',
  fileCount = 0,
): string {
  return applyMessageTemplate(config.extractCommonMainMergeFormat, {
    featureBranch,
    commonBranch,
    mainBranch: config.mainBranch,
    timestamp,
    fileCount,
  });
}

export function buildCreateMrTitle({
  sourceBranch,
  targetBranch,
  mrBranch,
  timestamp,
  architecture,
  isCheckout,
  config,
}: {
  sourceBranch: string;
  targetBranch: string;
  mrBranch: string;
  timestamp: string;
  architecture: string;
  isCheckout: boolean;
  config: Pick<Config, 'createMrTitleFormat' | 'createMrTitleCheckoutFormat'>;
}): string {
  const template =
    isCheckout && mrBranch !== sourceBranch
      ? config.createMrTitleCheckoutFormat
      : config.createMrTitleFormat;

  return applyMessageTemplate(template, {
    sourceBranch,
    targetBranch,
    mrBranch,
    timestamp,
    architecture,
  });
}

export function buildExtractCommitMessage({
  featureBranch,
  commonBranch,
  timestamp,
  changedFiles,
  mergeBase,
  mainBranch,
  config,
  commitVars,
}: {
  featureBranch: string;
  commonBranch: string;
  timestamp: string;
  changedFiles: string[];
  mergeBase: string;
  mainBranch: string;
  config: Pick<
    Config,
    | 'extractCommonCommitSubjectFormat'
    | 'extractCommonMainMergeFormat'
    | 'commitMessageFormat'
    | 'mainBranch'
  >;
  commitVars?: {
    type?: string | null;
    scope?: string | null;
    ticketId?: string | null;
    description?: string | null;
  };
}): string {
  const fileCount = changedFiles.length;
  const subject = buildExtractCommitSubject(
    featureBranch,
    timestamp,
    config,
    commonBranch,
    fileCount,
    commitVars,
  );
  const suggestedMerge = buildSuggestedMainMergeMessage(
    featureBranch,
    commonBranch,
    config,
    timestamp,
    fileCount,
  );

  return [
    subject,
    '',
    'Auto-extracted by @coolkits/git-workflows (extract-common workflow).',
    `Feature branch: ${featureBranch}`,
    `Common branch:  ${commonBranch}`,
    `Merge target:   ${mainBranch}`,
    `Files changed:  ${fileCount.toString()}`,
    `Merge-base:     ${mergeBase}`,
    '',
    `Suggested merge commit when merging into ${mainBranch}:`,
    suggestedMerge,
  ].join('\n');
}

export function buildMergeRequestDescription({
  featureBranch,
  commonBranch,
  changedFiles,
  mergeBase,
  mainBranch,
  config,
}: {
  featureBranch: string;
  commonBranch: string;
  changedFiles: string[];
  mergeBase: string;
  mainBranch: string;
  config: Pick<Config, 'extractCommonMainMergeFormat' | 'mainBranch'>;
}): string {
  return [
    `Auto-extracted common changes from \`${featureBranch}\`.`,
    '',
    `**Feature branch:** \`${featureBranch}\``,
    `**Common branch:** \`${commonBranch}\``,
    `**Merge target:** \`${mainBranch}\``,
    `**Files changed:** ${changedFiles.length.toString()}`,
    `**Merge-base:** \`${mergeBase}\``,
    '',
    `When merging this MR into \`${mainBranch}\`, keep the feature branch in the merge commit message:`,
    '',
    '```',
    buildSuggestedMainMergeMessage(featureBranch, commonBranch, config),
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
