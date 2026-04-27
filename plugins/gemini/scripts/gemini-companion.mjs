#!/usr/bin/env node
// gemini-plugin-cc companion script.
// Single dispatcher for the gemini plugin's four subcommands.

import process from "node:process";

import { parseArgs, splitRawArgumentString, resolveModelAlias } from "./lib/args.mjs";
import { resolveReviewTarget, collectReviewContext } from "./lib/git.mjs";
import { detectGemini, detectNpm, detectAuth, invokeGemini } from "./lib/gemini.mjs";
import { buildReviewPrompt, buildAdversarialPrompt } from "./lib/prompts.mjs";
import {
  renderSetupText,
  renderSetupJson,
  renderReviewHeader,
  renderError
} from "./lib/render.mjs";

// Top-level argv shape:
//   gemini-companion.mjs <subcommand> [args...]
// For review/adversarial-review/task we receive a single quoted string from
// $ARGUMENTS; we split it ourselves for predictable behavior.

const SUBCOMMANDS = new Set(["setup", "review", "adversarial-review", "task"]);

async function main() {
  const [, , rawSubcommand, ...rest] = process.argv;
  const subcommand = rawSubcommand ?? "";

  if (!SUBCOMMANDS.has(subcommand)) {
    process.stderr.write(
      `Unknown subcommand: ${subcommand || "(none)"}\n` +
        `Usage: gemini-companion.mjs <setup|review|adversarial-review|task> [args]\n`
    );
    process.exit(2);
  }

  const argv = normalizeArgv(rest);

  try {
    switch (subcommand) {
      case "setup":
        return await runSetup(argv);
      case "review":
        return await runReview(argv, { mode: "review" });
      case "adversarial-review":
        return await runReview(argv, { mode: "adversarial-review" });
      case "task":
        return await runTask(argv);
    }
  } catch (error) {
    process.stdout.write(renderError(error) + "\n");
    process.exit(1);
  }
}

// Claude Code passes "$ARGUMENTS" as a single quoted token. If we got
// exactly one positional and it contains whitespace, split it.
function normalizeArgv(rest) {
  if (rest.length === 1 && /\s/.test(rest[0])) {
    return splitRawArgumentString(rest[0]);
  }
  return rest;
}

async function runSetup(rest) {
  const { options } = parseArgs(rest, {
    booleanOptions: ["json"]
  });

  const state = {
    gemini: detectGemini(),
    auth: { authenticated: false },
    npm: detectNpm()
  };
  if (state.gemini.installed) {
    state.auth = detectAuth();
  }

  const output = options.json ? renderSetupJson(state) : renderSetupText(state);
  process.stdout.write(output + "\n");
}

async function runReview(rest, { mode }) {
  const { options, positionals } = parseArgs(rest, {
    valueOptions: ["base", "model"],
    booleanOptions: ["wait", "background"]
  });

  const geminiState = detectGemini();
  if (!geminiState.installed) {
    process.stdout.write(
      "Gemini CLI is not installed. Run /gemini:setup to install it.\n"
    );
    return;
  }

  const cwd = process.cwd();
  const target = resolveReviewTarget(cwd, { base: options.base });
  const context = collectReviewContext(cwd, target);

  if (context.isEmpty) {
    process.stdout.write(`No changes to review for ${target.label}.\n`);
    return;
  }

  const userFocus = positionals.join(" ").trim();
  const prompt =
    mode === "adversarial-review"
      ? buildAdversarialPrompt({
          targetLabel: target.label,
          userFocus,
          summary: context.summary,
          content: context.content
        })
      : buildReviewPrompt({
          targetLabel: target.label,
          summary: context.summary,
          content: context.content
        });

  process.stdout.write(renderReviewHeader({ summary: context.summary, target, mode }));

  const model = resolveModelAlias(options.model);
  const result = await invokeGemini({ prompt, model, write: false, cwd });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function runTask(rest) {
  const { options, positionals } = parseArgs(rest, {
    valueOptions: ["model"],
    booleanOptions: ["write", "wait", "background"]
  });

  const geminiState = detectGemini();
  if (!geminiState.installed) {
    process.stdout.write(
      "Gemini CLI is not installed. Run /gemini:setup to install it.\n"
    );
    return;
  }

  const taskText = positionals.join(" ").trim();
  if (!taskText) {
    process.stdout.write("No task provided. Pass the task description as text.\n");
    process.exit(2);
  }

  const cwd = process.cwd();
  const model = resolveModelAlias(options.model);
  const result = await invokeGemini({
    prompt: taskText,
    model,
    write: Boolean(options.write),
    cwd
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

main().catch((error) => {
  process.stdout.write(renderError(error) + "\n");
  process.exit(1);
});
