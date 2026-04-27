// Trimmed git helpers. Adapted from codex-plugin-cc (Apache-2.0).

import { runCommand, runCommandChecked, formatCommandFailure } from "./process.mjs";

function git(cwd, args, options = {}) {
  return runCommand("git", args, { cwd, ...options });
}

function gitChecked(cwd, args, options = {}) {
  return runCommandChecked("git", args, { cwd, ...options });
}

export function ensureGitRepository(cwd) {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (result.error && result.error.code === "ENOENT") {
    throw new Error("git is not installed. Install Git and retry.");
  }
  if (result.status !== 0) {
    throw new Error("This command must run inside a Git repository.");
  }
  return result.stdout.trim();
}

export function getRepoRoot(cwd) {
  return gitChecked(cwd, ["rev-parse", "--show-toplevel"]).stdout.trim();
}

export function getCurrentBranch(cwd) {
  return gitChecked(cwd, ["branch", "--show-current"]).stdout.trim() || "HEAD";
}

export function detectDefaultBranch(cwd) {
  const symbolic = git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (symbolic.status === 0) {
    const remoteHead = symbolic.stdout.trim();
    if (remoteHead.startsWith("refs/remotes/origin/")) {
      return remoteHead.replace("refs/remotes/origin/", "");
    }
  }

  const candidates = ["main", "master", "trunk"];
  for (const candidate of candidates) {
    const local = git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`]);
    if (local.status === 0) {
      return candidate;
    }
    const remote = git(cwd, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${candidate}`]);
    if (remote.status === 0) {
      return `origin/${candidate}`;
    }
  }

  throw new Error("Unable to detect the default branch. Pass --base <ref>.");
}

export function getWorkingTreeState(cwd) {
  const staged = gitChecked(cwd, ["diff", "--cached", "--name-only"]).stdout.trim().split("\n").filter(Boolean);
  const unstaged = gitChecked(cwd, ["diff", "--name-only"]).stdout.trim().split("\n").filter(Boolean);
  const untracked = gitChecked(cwd, ["ls-files", "--others", "--exclude-standard"]).stdout.trim().split("\n").filter(Boolean);

  return {
    staged,
    unstaged,
    untracked,
    isDirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0
  };
}

export function resolveReviewTarget(cwd, options = {}) {
  ensureGitRepository(cwd);
  const baseRef = options.base ?? null;

  if (baseRef) {
    return { mode: "branch", baseRef, label: `branch diff against ${baseRef}` };
  }

  const state = getWorkingTreeState(cwd);
  if (state.isDirty) {
    return { mode: "working-tree", label: "working tree diff" };
  }

  const detectedBase = detectDefaultBranch(cwd);
  return { mode: "branch", baseRef: detectedBase, label: `branch diff against ${detectedBase}` };
}

function section(title, body) {
  const trimmed = (body || "").trim();
  return `## ${title}\n\n${trimmed || "(none)"}\n`;
}

export function collectReviewContext(cwd, target) {
  const repoRoot = getRepoRoot(cwd);
  const branch = getCurrentBranch(repoRoot);

  if (target.mode === "working-tree") {
    const state = getWorkingTreeState(repoRoot);
    const status = gitChecked(repoRoot, ["status", "--short", "--untracked-files=all"]).stdout;
    const stagedDiff = gitChecked(repoRoot, ["diff", "--cached", "--no-ext-diff", "--submodule=diff"]).stdout;
    const unstagedDiff = gitChecked(repoRoot, ["diff", "--no-ext-diff", "--submodule=diff"]).stdout;

    const content = [
      section("Git Status", status),
      section("Staged Diff", stagedDiff),
      section("Unstaged Diff", unstagedDiff),
      section("Untracked Files", state.untracked.join("\n"))
    ].join("\n");

    const summary = `Reviewing ${state.staged.length} staged, ${state.unstaged.length} unstaged, and ${state.untracked.length} untracked file(s) on branch ${branch}.`;
    const isEmpty = !state.isDirty;
    return { content, summary, isEmpty, target, branch };
  }

  // branch mode
  const range = `${target.baseRef}...HEAD`;
  const log = gitChecked(repoRoot, ["log", "--oneline", "--decorate", range]).stdout;
  const stat = gitChecked(repoRoot, ["diff", "--stat", range]).stdout;
  const diff = gitChecked(repoRoot, ["diff", "--no-ext-diff", "--submodule=diff", range]).stdout;
  const fileCount = gitChecked(repoRoot, ["diff", "--name-only", range]).stdout.trim().split("\n").filter(Boolean).length;

  const content = [
    section("Commit Log", log),
    section("Diff Stat", stat),
    section("Branch Diff", diff)
  ].join("\n");

  const summary = `Reviewing branch ${branch} against ${target.baseRef} (${fileCount} file(s) changed).`;
  const isEmpty = fileCount === 0;
  return { content, summary, isEmpty, target, branch };
}
