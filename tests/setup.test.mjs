import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderSetupText,
  renderSetupJson,
  renderReviewHeader,
  renderError
} from "../plugins/gemini/scripts/lib/render.mjs";
import { buildGeminiArgs } from "../plugins/gemini/scripts/lib/gemini.mjs";

test("renderSetupText says install when missing", () => {
  const out = renderSetupText({
    gemini: { installed: false },
    auth: { authenticated: false },
    npm: { available: true }
  });
  assert.match(out, /not installed/);
  assert.match(out, /npm install -g @google\/gemini-cli/);
});

test("renderSetupText says ready when installed and authenticated", () => {
  const out = renderSetupText({
    gemini: { installed: true, version: "0.9.0" },
    auth: { authenticated: true, method: "oauth" },
    npm: { available: true }
  });
  assert.match(out, /Gemini CLI: installed \(0\.9\.0\)/);
  assert.match(out, /Auth: oauth/);
  assert.match(out, /Ready/);
});

test("renderSetupText prompts for sign-in when unauthenticated", () => {
  const out = renderSetupText({
    gemini: { installed: true, version: "0.9.0" },
    auth: { authenticated: false },
    npm: { available: true }
  });
  assert.match(out, /Not authenticated/);
  assert.match(out, /!gemini/);
  assert.match(out, /GEMINI_API_KEY/);
});

test("renderSetupJson emits stable shape", () => {
  const out = renderSetupJson({
    gemini: { installed: true, version: "0.9.0" },
    auth: { authenticated: true, method: "api-key" },
    npm: { available: true }
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.installed, true);
  assert.equal(parsed.version, "0.9.0");
  assert.equal(parsed.authenticated, true);
  assert.equal(parsed.auth_method, "api-key");
  assert.equal(parsed.ready, true);
});

test("renderSetupJson reports not-ready when missing auth", () => {
  const out = renderSetupJson({
    gemini: { installed: true, version: "0.9.0" },
    auth: { authenticated: false },
    npm: { available: true }
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.auth_method, null);
});

test("renderReviewHeader includes summary and target label", () => {
  const out = renderReviewHeader({
    summary: "Reviewing 3 files",
    target: { label: "branch diff against main" },
    mode: "review"
  });
  assert.match(out, /Reviewing 3 files/);
  assert.match(out, /branch diff against main/);
  assert.match(out, /Gemini review/);
});

test("renderError formats Error instances", () => {
  assert.equal(renderError(new Error("nope")), "Error: nope");
});

test("renderError stringifies non-Error values", () => {
  assert.equal(renderError("plain string"), "Error: plain string");
});

test("buildGeminiArgs uses plan mode for read-only", () => {
  const args = buildGeminiArgs({ prompt: "hi" });
  assert.deepEqual(args, ["--approval-mode", "plan", "--prompt", "hi"]);
});

test("buildGeminiArgs uses yolo mode when write is requested", () => {
  const args = buildGeminiArgs({ prompt: "fix it", write: true });
  assert.deepEqual(args, ["--approval-mode", "yolo", "--prompt", "fix it"]);
});

test("buildGeminiArgs threads through model selection", () => {
  const args = buildGeminiArgs({ prompt: "review", model: "gemini-2.5-pro" });
  assert.deepEqual(args, [
    "--approval-mode",
    "plan",
    "--model",
    "gemini-2.5-pro",
    "--prompt",
    "review"
  ]);
});

test("buildGeminiArgs combines write and model correctly", () => {
  const args = buildGeminiArgs({
    prompt: "do it",
    model: "gemini-2.5-flash",
    write: true
  });
  assert.deepEqual(args, [
    "--approval-mode",
    "yolo",
    "--model",
    "gemini-2.5-flash",
    "--prompt",
    "do it"
  ]);
});
