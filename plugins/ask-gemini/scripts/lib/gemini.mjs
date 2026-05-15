import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { binaryAvailable, runCommand, streamCommand } from "./process.mjs";

const GEMINI_BINARY = "gemini";
const NPM_PACKAGE = "@google/gemini-cli";

export function detectGemini() {
  const probe = binaryAvailable(GEMINI_BINARY, ["--version"]);
  if (!probe.available) {
    return { installed: false, detail: probe.detail };
  }
  return { installed: true, version: probe.detail };
}

export function detectNpm() {
  const probe = binaryAvailable("npm", ["--version"]);
  return { available: probe.available, version: probe.available ? probe.detail : null };
}

// Best-effort auth probe. Gemini CLI stores OAuth credentials under
// ~/.gemini/ when the user signs in via Google account; an API key
// in env (GEMINI_API_KEY or GOOGLE_API_KEY) also works. We do not
// run a live `gemini --prompt` here because that costs tokens; the
// CLI itself surfaces auth errors at first use.
export function detectAuth() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return { authenticated: true, method: "api-key" };
  }

  const credsDir = path.join(os.homedir(), ".gemini");
  const candidates = ["oauth_creds.json", "credentials.json", "settings.json"];
  for (const name of candidates) {
    const filePath = path.join(credsDir, name);
    if (fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 0) {
          return { authenticated: true, method: "oauth", path: filePath };
        }
      } catch {
        // ignore
      }
    }
  }

  return { authenticated: false };
}

// We always pass an empty string for `--prompt` and pipe the actual prompt
// body through stdin. This is the only safe choice: prompts can run into
// hundreds of KB on a multi-file review, which exceeds the OS argv length
// limit (E2BIG, ~128KB on Linux per single argument). `--prompt ""` still
// triggers gemini's non-interactive mode; the `-p` value is concatenated
// after stdin, so empty makes stdin the entire prompt.
export function buildGeminiArgs({ model, write }) {
  const args = [];
  // Pick an explicit approval mode so non-interactive runs never hang on a
  // tool-approval prompt. plan = read-only; yolo = auto-approve everything.
  args.push("--approval-mode", write ? "yolo" : "plan");
  if (model) {
    args.push("--model", model);
  }
  args.push("--prompt", "");
  return args;
}

// Invokes gemini, streams stdout/stderr to this process's tty, and
// resolves with the exit status. The prompt is delivered via stdin to
// avoid OS argv length limits on large repository contexts.
export function invokeGemini({ prompt, model, write, cwd }) {
  const args = buildGeminiArgs({ model, write });
  return streamCommand(GEMINI_BINARY, args, { cwd, input: prompt });
}

export function npmInstallCommand() {
  return ["npm", "install", "-g", NPM_PACKAGE];
}

export function npmPackageName() {
  return NPM_PACKAGE;
}
