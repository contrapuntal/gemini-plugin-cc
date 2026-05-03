# Gemini plugin for Claude Code

Run Gemini from inside Claude Code for code reviews and delegated tasks.

This plugin lets Claude Code users reach Gemini without leaving their workflow. It adapts [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) to Gemini CLI's runtime model.

## What You Get

- `/gemini:review` — read-only Gemini review
- `/gemini:adversarial-review` — steerable challenge review
- `/gemini:rescue` — delegate tasks to Gemini through the `gemini:gemini-rescue` subagent
- `/gemini:setup` — verify the local Gemini CLI is installed and authenticated

## Requirements

- **Google account (free tier available) or `GEMINI_API_KEY`.**
- **Node.js 18.18 or later**

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add contrapuntal/gemini-plugin-cc
```

Install the plugin:

```bash
/plugin install gemini@google-gemini
```

Reload plugins:

```bash
/reload-plugins
```

Then run:

```bash
/gemini:setup
```

`/gemini:setup` reports whether Gemini is ready. If Gemini is missing and npm is available, it offers to install it.

To install Gemini yourself:

```bash
npm install -g @google/gemini-cli
```

If Gemini is installed but not signed in:

```bash
!gemini
```

Sign in with your Google account inside the interactive REPL (or set `GEMINI_API_KEY` in your environment), then exit.

After install, you should see:

- the slash commands listed below
- the `gemini:gemini-rescue` subagent in `/agents`

## Usage

### `/gemini:review`

Runs a Gemini review on your current work. Output is markdown organized by severity (Critical / High / Medium / Nits).

> [!NOTE]
> Multi-file reviews can take a while. Use background mode for anything larger than ~2 files.

Use it to review:

- your current uncommitted changes
- your branch against a base branch like `main`

Pass `--base <ref>` for branch review. Also supports `--wait` and `--background`. Read-only and not steerable. To challenge a specific decision or risk area, use [`/gemini:adversarial-review`](#geminiadversarial-review).

```bash
/gemini:review
/gemini:review --base main
/gemini:review --background
```

This command never edits files.

### `/gemini:adversarial-review`

A **steerable** review that challenges the chosen implementation and design. Uses the same review-target selection as `/gemini:review`.

Supports `--base <ref>`, `--wait`, `--background`, and free-form focus text after the flags.

```bash
/gemini:adversarial-review
/gemini:adversarial-review --base main challenge whether this caching design is right
/gemini:adversarial-review --background look for race conditions in the retry logic
```

This command never edits files.

### `/gemini:rescue`

Hands a task to Gemini through the `gemini:gemini-rescue` subagent. Read-only by default — Gemini analyzes and proposes; Claude or you apply the change. Pass `--write` to let Gemini edit files directly via Gemini's `--yolo` mode.

Use it to have Gemini:

- analyze a large diff or codebase region (Gemini's 1M-token context shines here)
- give a second opinion on an approach Claude proposed
- investigate a bug or run an analysis pass

```bash
/gemini:rescue investigate why the build is failing in CI
/gemini:rescue --model pro analyze the entire src/ directory for race conditions
/gemini:rescue --write fix the failing test with the smallest safe patch
/gemini:rescue --background trace every caller of this function across the repo
```

Or just ask:

```text
Ask Gemini to walk through the auth middleware and find anything that breaks under partial failure.
```

**Notes:**
- Read-only by default. Add `--write` to let Gemini edit.
- Model aliases: `pro` → `gemini-2.5-pro`, `flash` → `gemini-2.5-flash`.
- `--background` runs the rescue as a Claude Code background bash task; output appears in chat when Gemini finishes.

### `/gemini:setup`

Checks whether Gemini is installed and authenticated. If Gemini is missing and `npm` is available, it offers to install it.

```bash
/gemini:setup
```

## How it works

The plugin invokes Gemini in non-interactive mode (`gemini --prompt "..."`) with a fixed approval mode:

- **Read-only paths** (`/gemini:review`, `/gemini:adversarial-review`, `/gemini:rescue` without `--write`) use `--approval-mode plan`, so the run cannot hang on an interactive approval prompt and Gemini cannot modify the workspace.
- **Write path** (`/gemini:rescue --write`) uses `--approval-mode yolo` (equivalent to `--yolo`). Gemini auto-approves all tools, including shell commands.

### Model selection

- **`/gemini:review` and `/gemini:adversarial-review`** default to **`gemini-3.1-pro-preview`**. Gemini CLI's "auto" routing can drop a long review prompt onto Flash, which produces noticeably shallower findings on the same input. Pinning reviews to the latest Pro preview keeps quality predictable. Override with `--model flash`, `--model pro` (which still resolves to `gemini-2.5-pro`), or any explicit model name.
- **`/gemini:rescue`** forces no default. It respects whatever model your Gemini CLI config picks, including auto. Pass `--model pro` (or `--model <name>`) per-call for explicit control.

The plugin is **stateless** — no transcripts, no PID files, no session resume. Every invocation is a one-shot Gemini call. This matches Gemini CLI's actual non-interactive shape and keeps the plugin small.

### Trust model for slash command arguments

Claude Code interpolates slash command arguments (`$ARGUMENTS`) into a Bash command string before passing them to the companion script. This is the standard Claude Code idiom (codex-plugin-cc and other official plugins use the identical pattern). It means **your shell interprets shell metacharacters in slash args** — `/gemini:rescue $(echo hi)` expands the command substitution before reaching the plugin. The threat model assumes you typed the slash command yourself; treat it with the care you'd apply to any command you run directly in your terminal.

## What's not included (and why)

These pieces from codex-plugin-cc are deliberately left out of v1:

| Codex feature | Why dropped |
|---------------|-------------|
| `/codex:status`, `/codex:result`, `/codex:cancel` | Gemini CLI has no app-server / job-control protocol. Claude Code's native `run_in_background: true` handles backgrounding. |
| `--resume` / `--fresh` | Gemini's non-interactive mode has no session-resume RPC. The interactive REPL offers `/chat resume` for users who need it. |
| Stop-hook review gate | Footgun (cost, loops). May arrive in v1.x once the core flow is validated. |
| JSON-schema review output | Gemini's plain-text mode makes JSON parsing brittle. Markdown sections degrade gracefully. |

For the full rationale, see `docs/plans/2026-04-26-gemini-plugin-cc-design.md`.

## Use from other coding agents (Codex CLI, OpenCode, Pi.dev)

The plugin's *Claude Code packaging* (`.claude-plugin/plugin.json` + `commands/*.md` + `agents/*.md`) is Claude-Code-specific and will not load in other agents.

For agents that understand the **Anthropic Skill format** (a `<name>/SKILL.md` directory), this repo ships a portable shim at `skills/gemini-helper/SKILL.md`. It exposes the same companion script's interface to a model-invoked skill loader. You lose the slash-command UX, but the capability remains reachable.

To install:

```bash
# Set these once per shell (or in your shell rc).
# GEMINI_PLUGIN_CC_ROOT lets the skill find the companion script.
# GEMINI_CLI_TRUST_WORKSPACE keeps headless Gemini from refusing to run in untrusted dirs.
export GEMINI_PLUGIN_CC_ROOT="$(pwd)"
export GEMINI_CLI_TRUST_WORKSPACE=true

# OpenCode
ln -s "$GEMINI_PLUGIN_CC_ROOT/skills/gemini-helper" ~/.config/opencode/skills/gemini-helper

# Codex CLI
ln -s "$GEMINI_PLUGIN_CC_ROOT/skills/gemini-helper" ~/.codex/skills/gemini-helper

# Pi.dev (consult its package docs for the right skills directory; or distribute as an npm package)
```

When invoking the host agent, prefer non-interactive modes that auto-approve shell commands (Pi: `--print`, OpenCode: `opencode run`, Codex CLI: `codex exec -s workspace-write`). For Codex CLI specifically, **set `GEMINI_API_KEY` for the session** if Gemini is configured for OAuth — Codex's process isolation prevents Gemini's headless OAuth token refresh from completing the browser handoff, even though the setup probe reports `authenticated: true`. The API key bypasses OAuth entirely.

Once linked, the agent's model loads the skill on demand based on its description. Prerequisites match Claude Code: `gemini` CLI installed and authenticated, `node` 18.18+ on PATH.

**Not supported:** GitHub Copilot CLI has no arbitrary skill/plugin format and cannot host this.

## Testing

```bash
npm test
```

Runs unit tests against arg parsing, prompt assembly, git helpers, rendering, and process spawning. Tests never invoke the real `gemini` binary.

## License

Apache-2.0. Adapted from codex-plugin-cc (also Apache-2.0); see `NOTICE`.
