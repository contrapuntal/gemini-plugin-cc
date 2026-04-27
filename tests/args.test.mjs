import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseArgs,
  splitRawArgumentString,
  resolveModelAlias,
  DEFAULT_REVIEW_MODEL
} from "../plugins/gemini/scripts/lib/args.mjs";
import { normalizeArgv } from "../plugins/gemini/scripts/gemini-companion.mjs";

test("parseArgs handles boolean flags", () => {
  const { options, positionals } = parseArgs(["--write", "fix", "the", "bug"], {
    booleanOptions: ["write"]
  });
  assert.equal(options.write, true);
  assert.deepEqual(positionals, ["fix", "the", "bug"]);
});

test("parseArgs handles value flags with separate value", () => {
  const { options } = parseArgs(["--base", "main"], {
    valueOptions: ["base"]
  });
  assert.equal(options.base, "main");
});

test("parseArgs handles value flags with inline value", () => {
  const { options } = parseArgs(["--base=main"], {
    valueOptions: ["base"]
  });
  assert.equal(options.base, "main");
});

test("parseArgs throws when value flag is missing its value", () => {
  assert.throws(
    () => parseArgs(["--base"], { valueOptions: ["base"] }),
    /Missing value for --base/
  );
});

test("parseArgs preserves positional ordering", () => {
  const { positionals } = parseArgs(["investigate", "the", "flaky", "test"]);
  assert.deepEqual(positionals, ["investigate", "the", "flaky", "test"]);
});

test("parseArgs treats -- as passthrough", () => {
  const { positionals } = parseArgs(["--write", "--", "--not-a-flag"], {
    booleanOptions: ["write"]
  });
  assert.deepEqual(positionals, ["--not-a-flag"]);
});

test("parseArgs supports alias map", () => {
  const { options } = parseArgs(["-m", "pro"], {
    valueOptions: ["model"],
    aliasMap: { m: "model" }
  });
  assert.equal(options.model, "pro");
});

test("splitRawArgumentString splits on whitespace", () => {
  assert.deepEqual(splitRawArgumentString("--base main"), ["--base", "main"]);
});

test("splitRawArgumentString preserves quoted segments", () => {
  assert.deepEqual(
    splitRawArgumentString(`--write "fix the failing test"`),
    ["--write", "fix the failing test"]
  );
});

test("splitRawArgumentString handles single quotes", () => {
  assert.deepEqual(
    splitRawArgumentString(`investigate 'the bug'`),
    ["investigate", "the bug"]
  );
});

test("splitRawArgumentString handles backslash escapes", () => {
  assert.deepEqual(
    splitRawArgumentString(`a\\ b c`),
    ["a b", "c"]
  );
});

test("resolveModelAlias maps known aliases", () => {
  assert.equal(resolveModelAlias("pro"), "gemini-2.5-pro");
  assert.equal(resolveModelAlias("flash"), "gemini-2.5-flash");
});

test("resolveModelAlias passes through unknown names", () => {
  assert.equal(resolveModelAlias("gemini-2.5-pro"), "gemini-2.5-pro");
  assert.equal(resolveModelAlias("custom-model-name"), "custom-model-name");
});

test("resolveModelAlias returns null for falsy input", () => {
  assert.equal(resolveModelAlias(null), null);
  assert.equal(resolveModelAlias(undefined), null);
  assert.equal(resolveModelAlias(""), null);
});

test("DEFAULT_REVIEW_MODEL pins reviews to the latest Pro preview", () => {
  // Reviews must not silently degrade to Flash via Gemini's auto routing.
  // If this constant changes, update README and confirm intent.
  assert.equal(DEFAULT_REVIEW_MODEL, "gemini-3.1-pro-preview");
});

test("normalizeArgv passes multi-element argv through untouched", () => {
  assert.deepEqual(
    normalizeArgv(["--write", "fix", "the", "bug"]),
    ["--write", "fix", "the", "bug"]
  );
});

test("normalizeArgv splits a single multi-word $ARGUMENTS token", () => {
  assert.deepEqual(
    normalizeArgv(["--base main investigate the bug"]),
    ["--base", "main", "investigate", "the", "bug"]
  );
});

test("normalizeArgv strips quotes from a single-word quoted token", () => {
  // Regression: the previous \s guard skipped tokenization for single-word
  // input, leaving literal quote characters in the prompt text.
  assert.deepEqual(normalizeArgv(['"refactor"']), ["refactor"]);
  assert.deepEqual(normalizeArgv(["'refactor'"]), ["refactor"]);
});

test("normalizeArgv leaves bare single-word tokens unchanged", () => {
  assert.deepEqual(normalizeArgv(["refactor"]), ["refactor"]);
});

test("normalizeArgv returns empty array for empty argv", () => {
  assert.deepEqual(normalizeArgv([]), []);
});
