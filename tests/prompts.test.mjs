import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadPrompt,
  renderTemplate,
  buildReviewPrompt,
  buildAdversarialPrompt
} from "../plugins/ask-gemini/scripts/lib/prompts.mjs";

test("loadPrompt reads review template", () => {
  const template = loadPrompt("review");
  assert.match(template, /\{\{TARGET_LABEL\}\}/);
  assert.match(template, /\{\{REPOSITORY_CONTEXT\}\}/);
  assert.match(template, /## Summary/);
});

test("loadPrompt reads adversarial-review template", () => {
  const template = loadPrompt("adversarial-review");
  assert.match(template, /\{\{USER_FOCUS\}\}/);
  assert.match(template, /adversarial software review/);
});

test("renderTemplate substitutes known variables", () => {
  const out = renderTemplate("Hello {{NAME}}, {{NAME}}!", { NAME: "world" });
  assert.equal(out, "Hello world, world!");
});

test("renderTemplate leaves unknown variables intact", () => {
  const out = renderTemplate("a {{KNOWN}} b {{UNKNOWN}}", { KNOWN: "1" });
  assert.equal(out, "a 1 b {{UNKNOWN}}");
});

test("renderTemplate substitutes empty string for null/undefined", () => {
  const out = renderTemplate("[{{V}}]", { V: null });
  assert.equal(out, "[]");
});

test("buildReviewPrompt injects all variables", () => {
  const out = buildReviewPrompt({
    targetLabel: "branch diff against main",
    summary: "Reviewing 3 files",
    content: "```diff\n+ added line\n```"
  });
  assert.match(out, /branch diff against main/);
  assert.match(out, /Reviewing 3 files/);
  assert.match(out, /\+ added line/);
  assert.doesNotMatch(out, /\{\{TARGET_LABEL\}\}/);
  assert.doesNotMatch(out, /\{\{REPOSITORY_CONTEXT\}\}/);
});

test("buildAdversarialPrompt injects user focus", () => {
  const out = buildAdversarialPrompt({
    targetLabel: "working tree diff",
    userFocus: "race conditions in retry logic",
    summary: "1 file changed",
    content: "diff body"
  });
  assert.match(out, /race conditions in retry logic/);
  assert.match(out, /working tree diff/);
});

test("buildAdversarialPrompt provides default focus when none given", () => {
  const out = buildAdversarialPrompt({
    targetLabel: "branch diff against main",
    userFocus: "",
    summary: "summary",
    content: "content"
  });
  assert.match(out, /apply general adversarial framing/);
});
