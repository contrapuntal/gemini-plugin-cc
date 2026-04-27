import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCommandChecked } from "../plugins/gemini/scripts/lib/process.mjs";
import {
  ensureGitRepository,
  getCurrentBranch,
  getWorkingTreeState,
  resolveReviewTarget,
  collectReviewContext
} from "../plugins/gemini/scripts/lib/git.mjs";

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-plugin-test-"));
  runCommandChecked("git", ["init", "--initial-branch=main", dir]);
  runCommandChecked("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  runCommandChecked("git", ["-C", dir, "config", "user.name", "Test"]);
  fs.writeFileSync(path.join(dir, "README.md"), "# test repo\n");
  runCommandChecked("git", ["-C", dir, "add", "."]);
  runCommandChecked("git", ["-C", dir, "commit", "-m", "init"]);
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test("ensureGitRepository accepts a repo", () => {
  const dir = makeTempRepo();
  try {
    assert.doesNotThrow(() => ensureGitRepository(dir));
  } finally {
    cleanup(dir);
  }
});

test("ensureGitRepository rejects a non-repo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-plugin-not-repo-"));
  try {
    assert.throws(() => ensureGitRepository(dir), /must run inside a Git repository/);
  } finally {
    cleanup(dir);
  }
});

test("getCurrentBranch returns the active branch", () => {
  const dir = makeTempRepo();
  try {
    assert.equal(getCurrentBranch(dir), "main");
  } finally {
    cleanup(dir);
  }
});

test("getWorkingTreeState detects dirty trees", () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, "new.txt"), "hello\n");
    const state = getWorkingTreeState(dir);
    assert.equal(state.isDirty, true);
    assert.deepEqual(state.untracked, ["new.txt"]);
    assert.deepEqual(state.unstaged, []);
    assert.deepEqual(state.staged, []);
  } finally {
    cleanup(dir);
  }
});

test("getWorkingTreeState reports clean trees", () => {
  const dir = makeTempRepo();
  try {
    const state = getWorkingTreeState(dir);
    assert.equal(state.isDirty, false);
  } finally {
    cleanup(dir);
  }
});

test("resolveReviewTarget defaults to working tree when dirty", () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, "new.txt"), "hello\n");
    const target = resolveReviewTarget(dir);
    assert.equal(target.mode, "working-tree");
  } finally {
    cleanup(dir);
  }
});

test("resolveReviewTarget honors explicit base ref", () => {
  const dir = makeTempRepo();
  try {
    const target = resolveReviewTarget(dir, { base: "main" });
    assert.equal(target.mode, "branch");
    assert.equal(target.baseRef, "main");
  } finally {
    cleanup(dir);
  }
});

test("collectReviewContext reports empty when working tree is clean and no base", () => {
  const dir = makeTempRepo();
  try {
    // working tree is clean and we are on the default branch, so branch
    // mode against main produces an empty diff
    const target = resolveReviewTarget(dir, { base: "main" });
    const context = collectReviewContext(dir, target);
    assert.equal(context.isEmpty, true);
  } finally {
    cleanup(dir);
  }
});

test("collectReviewContext inlines untracked file contents", () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, "feature.js"), "export const SECRET_MARKER_42 = 1;\n");
    const target = resolveReviewTarget(dir);
    const context = collectReviewContext(dir, target);
    assert.equal(context.isEmpty, false);
    assert.match(context.content, /Untracked Files/);
    assert.match(context.content, /feature\.js/);
    // Regression: the body, not just the path, must reach Gemini.
    assert.match(context.content, /SECRET_MARKER_42/);
    assert.match(context.summary, /1 untracked/);
  } finally {
    cleanup(dir);
  }
});

test("collectReviewContext skips binary untracked files but lists them", () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, "blob.bin"), Buffer.from([0, 1, 2, 0, 3, 4]));
    const target = resolveReviewTarget(dir);
    const context = collectReviewContext(dir, target);
    assert.match(context.content, /blob\.bin/);
    assert.match(context.content, /skipped: binary file/);
  } finally {
    cleanup(dir);
  }
});

test("collectReviewContext skips oversized untracked files", () => {
  const dir = makeTempRepo();
  try {
    // 64KB > 24KB cap
    fs.writeFileSync(path.join(dir, "big.txt"), "a".repeat(64 * 1024));
    const target = resolveReviewTarget(dir);
    const context = collectReviewContext(dir, target);
    assert.match(context.content, /big\.txt/);
    assert.match(context.content, /skipped: \d+ bytes exceeds/);
  } finally {
    cleanup(dir);
  }
});
