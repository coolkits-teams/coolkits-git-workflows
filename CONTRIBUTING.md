# Contributing to @coolkits/git-workflows

Thank you for your interest in contributing. This document explains how the
project works and how to get involved.

---

## Ownership and release policy

**This project is owner-maintained.**

- All merge requests must be reviewed and approved by the owner ([@davidngo239](https://github.com/davidngo239)) before merging.
- Only the owner publishes releases to the npm registry. Do not attempt to run `npm publish` on behalf of the project.
- The `main` branch is protected. Direct pushes are not accepted.

---

## How to contribute

### 1. Open an issue first

Before writing any code, open an issue to describe:

- **Bug report** — What you expected, what happened, steps to reproduce.
- **Feature request** — What problem it solves, your proposed API/behaviour.
- **Question** — Anything unclear in the docs or behaviour.

This avoids wasted effort if the change does not align with the project's direction.

### 2. Fork and branch

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/git-workflows.git
cd git-workflows

# Create a branch off main
git checkout -b fix/describe-the-fix
# or
git checkout -b feat/describe-the-feature
```

Branch naming convention:

| Prefix      | When to use                           |
| ----------- | ------------------------------------- |
| `fix/`      | Bug fix                               |
| `feat/`     | New feature or enhancement            |
| `docs/`     | Documentation only                    |
| `refactor/` | Internal cleanup, no behaviour change |
| `chore/`    | Dependency bumps, build changes       |

### 3. Make your changes

**Rules:**

- No build step, no bundler. The source files _are_ the distribution — keep it that way.
- Zero runtime `dependencies` in `package.json`. Add nothing to `dependencies`.
- Every public function must have a JSDoc comment.
- Run verification before committing:

```bash
npm run verify
```

- Follow the existing code style:
  - ESM (`import`/`export`) throughout.
  - Named exports only (no `export default` except from `bin/`).
  - Prefer `const`, early returns, and flat logic over nested conditions.
  - All user-facing strings in English.

### 4. Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
fix: handle glab auth failure gracefully
feat: support multiple featurePath entries
docs: add conflict resolution example
refactor: extract buildPathspec into its own function
```

### 5. Open a pull request

- Target branch: `main`.
- Fill in the PR description — what changed and why.
- Reference the related issue: `Closes #42`.
- The owner will review and may request changes before merging.

---

## What gets rejected

- Changes that add runtime dependencies.
- Changes that introduce a build/compile step.
- Breaking changes to the public API without a discussion in an issue first.
- PRs opened without a linked issue (except for trivial typo fixes).
- Any attempt to automate publishing without owner approval.

---

## Local setup

```bash
git clone https://github.com/coolkits/git-workflows.git
cd git-workflows

# No install step needed — zero dependencies.

# Run a command locally
node bin/extract-common.js --help
node bin/sync-from-root.js --help

# Verify all source files and exports
npm run verify
```

---

## Questions?

Open a [GitHub issue](https://github.com/coolkits/git-workflows/issues) or start a
[Discussion](https://github.com/coolkits/git-workflows/discussions).
