import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderSetupText,
  renderSetupJson,
  renderReviewHeader,
  renderError
} from "../plugins/ask-gemini/scripts/lib/render.mjs";
import { buildGeminiArgs } from "../plugins/ask-gemini/scripts/lib/gemini.mjs";

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

test("buildGeminiArgs uses plan mode for read-only with empty --prompt", () => {
  // The actual prompt body is sent via stdin to avoid OS argv length limits;
  // --prompt "" still triggers non-interactive mode in the gemini CLI.
  const args = buildGeminiArgs({});
  assert.deepEqual(args, ["--approval-mode", "plan", "--prompt", ""]);
});

test("buildGeminiArgs uses yolo mode when write is requested", () => {
  const args = buildGeminiArgs({ write: true });
  assert.deepEqual(args, ["--approval-mode", "yolo", "--prompt", ""]);
});

test("buildGeminiArgs threads through model selection", () => {
  const args = buildGeminiArgs({ model: "gemini-2.5-pro" });
  assert.deepEqual(args, [
    "--approval-mode",
    "plan",
    "--model",
    "gemini-2.5-pro",
    "--prompt",
    ""
  ]);
});

test("buildGeminiArgs combines write and model correctly", () => {
  const args = buildGeminiArgs({
    model: "gemini-2.5-flash",
    write: true
  });
  assert.deepEqual(args, [
    "--approval-mode",
    "yolo",
    "--model",
    "gemini-2.5-flash",
    "--prompt",
    ""
  ]);
});

test("buildGeminiArgs never embeds prompt content as an argv item", () => {
  // Regression: the previous implementation passed `prompt` via --prompt,
  // which crashed on Linux with E2BIG once the prompt exceeded ~128KB.
  // Prompts now go via stdin; argv must not carry the body.
  const args = buildGeminiArgs({ model: "gemini-2.5-pro", write: true });
  for (const arg of args) {
    assert.ok(arg.length < 256, `argv item too long, suggests prompt leaked back: ${arg.length}`);
  }
});
