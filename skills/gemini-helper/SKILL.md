---
name: gemini-helper
description: Use when the user wants to invoke Gemini CLI for a code review of uncommitted changes or a branch diff, an adversarial design-challenge review, or to delegate a coding task to Gemini for a second opinion or large-context (1M token) analysis. Wraps the gemini-plugin-cc companion script.
license: Apache-2.0
compatibility: claude-code, opencode, codex, pi
metadata:
  origin: gemini-plugin-cc
---

# gemini-helper

This skill lets any Anthropic-Skill-aware agent (Codex CLI, OpenCode, Pi.dev, plus Claude Code via `.claude/skills/`) delegate to Gemini CLI for code review and task analysis. It wraps the `gemini-plugin-cc` companion script — a stateless Node.js dispatcher that assembles the prompt, applies an explicit approval mode (`plan` for read-only paths, `yolo` for write paths), and pipes the prompt through stdin to avoid OS argv length limits.

> If you are running inside Claude Code, prefer the slash-command surface (`/gemini:review`, `/gemini:adversarial-review`, `/gemini:rescue`, `/gemini:setup`) provided by the gemini-plugin-cc plugin. This skill is the portable fallback for agents without that plugin format.

## Prerequisites

- **`gemini` CLI installed and authenticated.** Install with `npm install -g @google/gemini-cli`. Sign in via `gemini` (interactive) and complete Google sign-in, or set `GEMINI_API_KEY` / `GOOGLE_API_KEY` in the environment.
- **`node` 18.18 or later** on PATH.
- **`GEMINI_PLUGIN_CC_ROOT` env var** pointing at the absolute path of the cloned `gemini-plugin-cc` repository. If that variable is unset, ask the user for the path before running the companion.
- **`GEMINI_CLI_TRUST_WORKSPACE=true`** when invoking from a directory Gemini hasn't been interactively trusted in. Without this, headless Gemini overrides `--approval-mode plan` to `default` and refuses to proceed. Export it for the session, or prepend it to every companion invocation.

## When to invoke this skill

Trigger on requests that match any of:

- "review my changes / diff / branch with Gemini"
- "challenge this design choice / pressure-test this implementation"
- "ask Gemini to investigate / analyze / fix X"
- "give me a second opinion on…" (especially when the question benefits from a large-context single pass)

Do **not** trigger when the user only wants Claude's own review or when the task is small enough that delegation adds latency without value.

## Invocations

All commands assume the working directory is the repo being reviewed/analyzed. If you have not exported `GEMINI_CLI_TRUST_WORKSPACE=true` for the session, prepend it to each command — Gemini's headless mode will refuse to run otherwise.

### Code review (read-only, structured markdown output)

```bash
GEMINI_CLI_TRUST_WORKSPACE=true \
  node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" review

GEMINI_CLI_TRUST_WORKSPACE=true \
  node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" review --base main
```

The output is markdown with a fixed skeleton: `## Summary` then `### Critical / High / Medium / Nits` sections. Stream it back to the user verbatim.

### Adversarial review (read-only, steerable, accepts focus text)

```bash
GEMINI_CLI_TRUST_WORKSPACE=true \
  node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" adversarial-review "look for race conditions in the retry path"
```

Same output shape; framing is "find reasons this should not ship" rather than general review.

### Delegate a task / second opinion

```bash
# Read-only: Gemini analyzes and proposes; the host agent or user applies any change.
GEMINI_CLI_TRUST_WORKSPACE=true \
  node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" task "investigate why the build is failing in CI"

# Write: Gemini may edit files directly via --yolo. Use only when the user explicitly asked for write-capable execution.
GEMINI_CLI_TRUST_WORKSPACE=true \
  node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" task --write "fix the failing test with the smallest safe patch"
```

### Setup probe (verify install + auth)

```bash
node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" setup
node "$GEMINI_PLUGIN_CC_ROOT/plugins/gemini/scripts/gemini-companion.mjs" setup --json
```

> Note for Codex CLI users with Gemini OAuth (not `GEMINI_API_KEY`): the live review call may stall on `Opening authentication page in your browser. Do you want to continue? [Y/n]:` even though the setup probe reports `authenticated: true`. Two sandbox restrictions cause this — Codex's `workspace-write` mode (1) blocks outbound network, so Gemini's OAuth-token refresh HTTP request fails, and (2) blocks writes outside the workspace, so Gemini cannot persist the rotated token to `~/.gemini/oauth_creds.json`. Either failure makes Gemini fall back to interactive browser auth, which Codex's process isolation cannot complete. **Both** must be granted:
>
> ```bash
> codex exec -s workspace-write \
>   -c 'sandbox_workspace_write.writable_roots=["/Users/<you>/.gemini"]' \
>   -c 'sandbox_workspace_write.network_access=true' \
>   --skip-git-repo-check \
>   "your prompt that triggers gemini-helper"
> ```
>
> The misleading part: the error reads `FatalCancellationError: Authentication cancelled by user`. The user did not cancel; the sandbox blocked the refresh.

If the result reports `installed: false`, suggest `npm install -g @google/gemini-cli`. If `authenticated: false`, suggest running `gemini` interactively to sign in.

## Model selection

Reviews default to `gemini-3.1-pro-preview` (Gemini's "auto" routing can drop long prompts onto Flash, which produces shallower findings). Override with `--model <name>` or one of these aliases:

- `--model pro` → `gemini-2.5-pro` (stable)
- `--model flash` → `gemini-2.5-flash` (fast, cheaper)
- `--model <full-name>` passes through unchanged

The `task` (rescue) subcommand respects whatever your Gemini CLI default is unless `--model` is passed.

## Backgrounding

For large reviews (multi-file diffs, branch reviews, or long rescue tasks), run the companion in the host agent's background-bash facility (`run_in_background: true` for Claude Code, equivalent for other agents). The companion script itself is stateless and synchronous — it does not manage background jobs.

## What this skill is NOT

- **Not a slash-command surface.** Skills are model-invoked; for `/gemini:review`-style UX, install the gemini-plugin-cc *plugin* into Claude Code instead.
- **Not stateful.** No transcripts, no session resume, no PID tracking. Every invocation is a fresh one-shot Gemini call.
- **Not a rewrite proxy.** The read-only paths (`review`, `adversarial-review`, default `task`) are guaranteed by `--approval-mode plan`; only `task --write` can modify the workspace.

## Reference

- Source: gemini-plugin-cc repository, `plugins/gemini/scripts/gemini-companion.mjs`
- License: Apache-2.0
- Test suite: `node --test tests/*.test.mjs` from the repo root (64 tests covering arg parsing, prompt assembly, git context collection, prompt-injection sanitization, symlink-exfiltration prevention, and process-signal handling)
