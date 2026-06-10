// Antigravity CLI (`agy`) adapter. Replaces the old gemini.mjs.
//
// Two things make agy different from the old `gemini` binary and shape this
// module (see memory: agy-cli-migration-constraints):
//   1. The prompt is an argv value, not stdin, so large multi-file prompts would
//      blow the OS argv limit -> we write the prompt to a temp file and add it to
//      agy's workspace with --add-dir, then a short -p instruction tells agy to
//      read it. (Verified: agy reads the file read-only, no skip-permissions.)
//   2. agy is agentic: print mode narrates tool-use steps before the answer, so
//      the real response is wrapped in marker lines and extracted (see
//      extractMarkedResponse).
//
// History: on agy <= 1.0.6, `agy -p` HUNG without a real terminal, which forced
// a python3 PTY bridge (lib/pty.mjs, since deleted). Fixed upstream in 1.0.7
// (verified 2026-06-09), so agy is spawned directly now — but older agy would
// still hang until our hard timeout, hence the MIN_AGY_VERSION gate below.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { binaryAvailable, captureCommand } from "./process.mjs";

const AGY_BINARY = "agy";
const CONFIG_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli");
const INSTALL_SH = "curl -fsSL https://antigravity.google/cli/install.sh | bash";
const INSTALL_BREW = "brew install --cask antigravity-cli";
const PRINT_TIMEOUT = "10m";
// Hard ceiling above agy's own --print-timeout, so a wedged process can't hang
// the companion forever.
const INVOKE_TIMEOUT_MS = 12 * 60 * 1000;

// Oldest agy whose print mode works without a terminal. On <= 1.0.6 a headless
// `-p` hangs producing nothing (upstream issue #7), so we refuse to invoke
// rather than stall until INVOKE_TIMEOUT_MS.
export const MIN_AGY_VERSION = "1.0.7";

// Compare an `agy --version` string against MIN_AGY_VERSION. Unparseable
// versions (dev builds) are assumed supported rather than blocking the user.
export function isSupportedVersion(version) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
  if (!match) return true;
  const [major, minor, patch] = match.slice(1).map(Number);
  const [minMajor, minMinor, minPatch] = MIN_AGY_VERSION.split(".").map(Number);
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

export function detectAntigravity() {
  const probe = binaryAvailable(AGY_BINARY, ["--version"]);
  if (!probe.available) {
    return { installed: false, detail: probe.detail };
  }
  return { installed: true, version: probe.detail, supported: isSupportedVersion(probe.detail) };
}

// Best-effort auth probe. agy keeps OAuth credentials in the OS keyring, which we
// cannot read here, so we cannot positively verify a signed-in session. We treat
// an ANTIGRAVITY_API_KEY env var, or a populated agy config dir (evidence the user
// has onboarded), as "authenticated" and let agy surface real auth errors at first
// use. This deliberately avoids false negatives that would nag onboarded users;
// note the command paths gate on `installed`, not on this probe.
export function detectAuth({ configDir = CONFIG_DIR } = {}) {
  if (process.env.ANTIGRAVITY_API_KEY) {
    return { authenticated: true, method: "api-key" };
  }
  try {
    if (fs.existsSync(configDir) && fs.readdirSync(configDir).length > 0) {
      return { authenticated: true, method: "keyring" };
    }
  } catch {
    // ignore
  }
  return { authenticated: false };
}

export function installHint() {
  return { primary: INSTALL_SH, alternate: INSTALL_BREW };
}

// agy is agentic: in print mode it narrates its tool-use steps ("I will read
// REQUEST.md...") before the actual answer, and a plain "no preamble" request
// does not suppress that. So we have agy wrap its real response between two
// unique marker lines and extract only that region (see extractMarkedResponse),
// which leaves the narration outside the markers and discarded.
export const RESPONSE_BEGIN = "===AGY-RESPONSE-BEGIN===";
export const RESPONSE_END = "===AGY-RESPONSE-END===";

// Build agy argv for an invocation. The prompt body is NOT here — it lives in
// `promptFile` inside `promptDir` (added via --add-dir); the -p instruction is a
// short fixed string, so prompt size never approaches the argv limit. `model`
// is a display name from `agy models` (print-mode --model exists on agy >= 1.0.5;
// our minimum is 1.0.7 anyway).
export function buildAgyArgs({ promptDir, promptFile, write, model }) {
  const args = [
    "-p",
    `Read the file ${promptFile} in the added workspace directory and do exactly what it asks. ` +
      `Then output a line containing only ${RESPONSE_BEGIN}, then your complete response, then a ` +
      `line containing only ${RESPONSE_END}. Put nothing other than your response between those ` +
      `marker lines, and output nothing after ${RESPONSE_END}.`,
    "--add-dir",
    promptDir,
    "--print-timeout",
    PRINT_TIMEOUT
  ];
  if (model) {
    args.push("--model", model);
  }
  if (write) {
    // Auto-approve tool use so write tasks don't stall on a permission prompt.
    args.push("--dangerously-skip-permissions");
  }
  return args;
}

// Pure, unit-testable: return the text between the first standalone BEGIN marker
// line and the next standalone END marker line, trimmed. Markers must be alone on
// their line (after trimming) so a mention inside narration prose never matches.
// Returns null when the markers are absent or unpaired — callers fall back to the
// full output so a non-compliant agy run never loses the answer.
export function extractMarkedResponse(text, begin = RESPONSE_BEGIN, end = RESPONSE_END) {
  if (!text) return null;
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === begin) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trim() === end) {
      return lines.slice(start, i).join("\n").trim();
    }
  }
  return null;
}

// Invoke agy, capture its response, print it. Resolves { status }. The temp
// prompt dir is always cleaned up. agy's stderr is passed through so real auth
// or quota errors stay visible.
export async function invokeAntigravity({ prompt, model, write, cwd }) {
  const promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-prompt-"));
  try {
    // Unique filename so the -p instruction can't be satisfied by a same-named
    // file in the user's workspace (cwd); the write is inside the try so a
    // failure still cleans up promptDir in the finally.
    const promptFile = `agy-request-${randomUUID()}.md`;
    fs.writeFileSync(path.join(promptDir, promptFile), prompt);

    const args = buildAgyArgs({ promptDir, promptFile, write, model });
    const result = await captureCommand(AGY_BINARY, args, { cwd, timeoutMs: INVOKE_TIMEOUT_MS });

    // Prefer the marker-delimited response (drops agy's tool-use narration); fall
    // back to the full captured output if agy didn't emit the markers.
    const answer = extractMarkedResponse(result.stdout) ?? result.stdout;
    if (answer) {
      process.stdout.write(answer.endsWith("\n") ? answer : answer + "\n");
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (result.timedOut) {
      process.stderr.write(`agy did not respond within ${PRINT_TIMEOUT}.\n`);
      return { status: result.status || 1 };
    }
    return { status: result.status };
  } finally {
    fs.rmSync(promptDir, { recursive: true, force: true });
  }
}
