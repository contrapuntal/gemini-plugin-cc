import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  runCommand,
  DEFAULT_MAX_BUFFER,
  streamCommand
} from "../plugins/ask-gemini/scripts/lib/process.mjs";

test("runCommand returns nonzero status when child is signaled", () => {
  // Regression: when a child is killed by signal, Node returns
  // result.status === null. The earlier `result.status ?? 0` mapping let
  // an interrupted git call look successful, so runCommandChecked would
  // accept partial/empty stdout. runCommand must surface signaled exits
  // as non-zero (128 + signal_number).
  //
  // Spawn a short-lived node child that signals itself and exits.
  const result = runCommand("node", [
    "-e",
    "process.kill(process.pid, 'SIGTERM'); setTimeout(()=>{}, 200);"
  ]);
  assert.notEqual(
    result.status,
    0,
    `signaled exits must surface as non-zero, got ${JSON.stringify({status: result.status, signal: result.signal})}`
  );
  assert.ok(result.signal, "signal name must be reported");
});

test("runCommand never invokes a shell unless explicitly requested", () => {
  // Regression: the previous implementation set shell: true on Windows,
  // which let shell metacharacters in args (branch names, refs) trigger
  // cmd.exe interpretation and command injection. shell:false is the
  // safe default; callers can override per-invocation.
  //
  // Verify the contract by trying to run a command that would only succeed
  // through a shell (using a shell-builtin echo expansion). Without shell,
  // the literal `$HOME` or `&&` doesn't get interpreted.
  const result = runCommand("node", ["-e", "console.log(process.argv[1])", "$HOME&&touch /tmp/INJ"]);
  assert.equal(result.status, 0);
  // The literal arg comes through unprocessed -- not interpreted as a
  // shell expansion, not chained with `&&`. (If a shell were involved,
  // `node -e ... $HOME && touch /tmp/INJ` would either expand $HOME or
  // chain a command.)
  assert.match(result.stdout, /\$HOME&&touch \/tmp\/INJ/);
});

test("DEFAULT_MAX_BUFFER is large enough for branch-scale diffs", () => {
  // Node's default is 1MB, which is too small for realistic git diffs.
  // 32MB is the floor we need; we ship 64MB for headroom.
  assert.ok(
    DEFAULT_MAX_BUFFER >= 32 * 1024 * 1024,
    `expected DEFAULT_MAX_BUFFER >= 32MB, got ${DEFAULT_MAX_BUFFER}`
  );
});

test("runCommand handles output larger than Node's default 1MB buffer", () => {
  // Synthesize ~2MB of stdout via a single shell command. With the old
  // code (no maxBuffer), this throws ENOBUFS.
  const result = runCommand("node", [
    "-e",
    "process.stdout.write('x'.repeat(2 * 1024 * 1024))"
  ]);
  assert.equal(result.error, null);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 2 * 1024 * 1024);
});

test("streamCommand pipes options.input to child stdin", async () => {
  // Regression for E2BIG fix: the prompt body must reach the child via
  // stdin, not via argv. Verify by piping a marker through and having the
  // child echo it back — the test passes only if the child actually
  // received the input on its stdin.
  // We can't use stdio: "inherit" here because we need to capture stdout.
  // So instead, exercise the contract via a child that writes a marker
  // file when it sees expected stdin content, then assert.
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-stream-input-"));
  const markerPath = path.join(dir, "marker.txt");
  try {
    const result = await streamCommand("node", [
      "-e",
      `
        let buf = "";
        process.stdin.on("data", (c) => { buf += c; });
        process.stdin.on("end", () => {
          require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, buf);
        });
      `
    ], { input: "MARKER_PAYLOAD_42" });
    assert.equal(result.status, 0);
    const marker = fs.readFileSync(markerPath, "utf8");
    assert.equal(marker, "MARKER_PAYLOAD_42");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("streamCommand returns nonzero status when child is signaled", async () => {
  // Spawn a node process that ignores SIGTERM-via-handler is awkward; instead
  // we use a trap-free child that exits via signal: a sleep we kill.
  const child = spawnSync("node", [
    "-e",
    `
      const { spawn } = require('node:child_process');
      const c = spawn('node', ['-e', 'setInterval(()=>{}, 1000)']);
      setTimeout(() => c.kill('SIGTERM'), 50);
      c.on('close', (code, signal) => {
        process.stdout.write(JSON.stringify({ code, signal }));
      });
    `
  ]);
  // Sanity: the inner spawn died from signal — confirms our test premise.
  const inner = JSON.parse(child.stdout.toString());
  assert.equal(inner.code, null);
  assert.equal(inner.signal, "SIGTERM");

  // Now exercise streamCommand with the same shape. We spawn a child that
  // we kill from within itself by raising SIGTERM — guarantees the close
  // event carries a signal.
  const result = await streamCommand("node", [
    "-e",
    "process.kill(process.pid, 'SIGTERM'); setInterval(()=>{}, 1000)"
  ]);
  assert.notEqual(
    result.status,
    0,
    `signaled exits must surface as non-zero, got ${JSON.stringify(result)}`
  );
  assert.ok(result.signal, "signal name must be reported");
});
