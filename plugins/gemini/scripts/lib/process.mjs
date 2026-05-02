// Adapted from codex-plugin-cc (Apache-2.0). See top-level NOTICE.

import { spawnSync, spawn } from "node:child_process";
import process from "node:process";

// Node's spawnSync default maxBuffer is 1MB. Real-world git diffs across a
// branch easily exceed that, throwing ENOBUFS before review can run. 64MB
// gives room for directory-scale reviews without pulling in streaming I/O.
export const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    stdio: options.stdio ?? "pipe",
    // Always shell:false. With shell:true on Windows, args containing
    // metacharacters (`&`, `|`, `;`, etc.) get interpreted by cmd.exe,
    // creating a command-injection vector when refs or user-supplied
    // arguments flow through. Node's spawn finds .exe binaries on PATH
    // without a shell on Windows; for `.cmd`/`.bat` wrappers a caller
    // can opt in via options.shell.
    shell: options.shell ?? false,
    windowsHide: true
  });

  return {
    command,
    args,
    status: result.status ?? 0,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

export function runCommandChecked(command, args = [], options = {}) {
  const result = runCommand(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(formatCommandFailure(result));
  }
  return result;
}

export function binaryAvailable(command, versionArgs = ["--version"], options = {}) {
  const result = runCommand(command, versionArgs, options);
  if (result.error && result.error.code === "ENOENT") {
    return { available: false, detail: "not found" };
  }
  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    return { available: false, detail };
  }
  return { available: true, detail: result.stdout.trim() || result.stderr.trim() || "ok" };
}

export function formatCommandFailure(result) {
  const parts = [`${result.command} ${result.args.join(" ")}`.trim()];
  if (result.signal) {
    parts.push(`signal=${result.signal}`);
  } else {
    parts.push(`exit=${result.status}`);
  }
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  if (stderr) {
    parts.push(stderr);
  } else if (stdout) {
    parts.push(stdout);
  }
  return parts.join(": ");
}

// Stream a child process's stdout/stderr to this process's stdio while
// also returning the exit code. Used for invoking gemini so the user sees
// output as it arrives instead of buffered until completion.
//
// When `options.input` is a string, it is written to the child's stdin and
// stdin is closed afterward. This is the route for prompt bodies that
// would otherwise overflow the OS argv length limit (E2BIG) when passed
// inline via `--prompt`.
//
// A signaled exit (SIGTERM, SIGKILL, etc.) reports code === null from Node;
// we surface that as a non-zero status so callers cannot mistake an
// interrupted run for a successful one.
export function streamCommand(command, args = [], options = {}) {
  const hasInput = typeof options.input === "string";
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: [hasInput ? "pipe" : "ignore", "inherit", "inherit"],
      windowsHide: true
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        resolve({ status: 128 + signalNumber(signal), signal });
        return;
      }
      resolve({ status: code ?? 0, signal: null });
    });
    if (hasInput) {
      child.stdin.on("error", reject);
      child.stdin.end(options.input);
    }
  });
}

function signalNumber(signal) {
  // Standard shell convention: status = 128 + signal number. We don't need
  // the exact mapping for every platform; pick a stable nonzero default
  // (15 = SIGTERM) when the name isn't a known number we want to encode.
  const known = { SIGINT: 2, SIGKILL: 9, SIGTERM: 15, SIGPIPE: 13, SIGHUP: 1, SIGQUIT: 3 };
  return known[signal] ?? 15;
}
