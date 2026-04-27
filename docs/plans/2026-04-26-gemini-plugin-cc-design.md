# gemini-plugin-cc — Design

**Date:** 2026-04-26
**Source:** brainstorming session, six locked decisions
**Reference:** `/Volumes/MacExternalStorage/proj/codex-plugin-cc` (architectural model, not a fork)

## Purpose

Mirror the *user-visible shape* of [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) — delegate-to-Gemini and review-from-Claude-Code — while respecting the very different runtime model of Gemini CLI versus Codex CLI. Position Gemini as a large-context analyst and second opinion rather than competing with Codex on agentic editing.

## Non-goals (v1)

- Background job tracking (`status`, `result`, `cancel`). Rationale: Claude Code's native `run_in_background: true` Bash flag already covers this.
- Session resume (`--resume` / `--fresh`). Rationale: Gemini CLI has no equivalent of `codex resume <session-id>` in non-interactive mode.
- Stop-hook review gate. Rationale: footgun (cost, loop), add later if validated.
- JSON-schema-constrained review output. Rationale: Gemini's plain-text mode makes JSON parsing brittle; markdown sections are simpler and degrade gracefully.

## Locked decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Scope | **B** — trimmed: setup, review, adversarial-review, rescue |
| Q2 | Filesystem mode for rescue | **B** — read-only default, `--write` opts into `--yolo` |
| Q3 | Session continuity | **A** — stateless, no resume |
| Q4 | Background execution | **B** — agent-level `run_in_background`, no plugin-side tracking |
| Q5 | Review output format | **B** — markdown with severity sections |
| Q6 | Stop-hook review gate | **B** — defer to v1.x |

## Architecture

### Repository layout

```
gemini-plugin-cc/
  .claude-plugin/
    marketplace.json            # advertises "google-gemini" marketplace
  plugins/gemini/
    .claude-plugin/plugin.json
    agents/gemini-rescue.md     # thin forwarding subagent
    commands/
      setup.md
      review.md
      adversarial-review.md
      rescue.md
    prompts/
      adversarial-review.md
      review.md                 # markdown-skeleton review prompt
    scripts/
      gemini-companion.mjs      # single dispatcher
      lib/
        args.mjs                # parseArgs + splitRawArgumentString (port verbatim from codex)
        gemini.mjs              # detect install/auth, build invocation, invoke
        git.mjs                 # scoped-down diff helpers
        prompts.mjs             # template loading + variable injection
        process.mjs             # runCommand / runCommandChecked (port from codex)
        render.mjs              # output formatting
    CHANGELOG.md
    LICENSE                     # Apache-2.0
    NOTICE
  docs/
    plans/2026-04-26-gemini-plugin-cc-design.md  # this doc
  tests/
    args.test.mjs
    prompts.test.mjs
    git.test.mjs
    setup.test.mjs
  package.json
  .gitignore
  LICENSE
  NOTICE
  README.md
```

### Runtime contract

The plugin is **stateless**. No state files, no transcripts, no PID tracking. Every command invocation is a one-shot operation:

```
Claude Code command/agent
  → node gemini-companion.mjs <subcommand> <args>
  → spawn gemini --prompt "<assembled prompt>"
  → stream stdout back to Claude
```

For `--write` rescues only, the spawn becomes `gemini --yolo --prompt "..."`.

### Companion script

`gemini-companion.mjs` is a single dispatcher with four subcommands:

- `setup [--json]` — detect install + auth, optionally produce JSON for the markdown command to consume
- `review <args>` — assemble review prompt from git diff, invoke Gemini, stream output
- `adversarial-review <args>` — same but with steerable focus text and the adversarial prompt template
- `task <args>` — rescue verb. Forward task text to Gemini. Honors `--write`, `--model`, `--background` is a no-op (handled at agent level).

Argument parsing reuses codex's `args.mjs` pattern (`parseArgs` + `splitRawArgumentString`) — well-designed and apache-licensed.

### Command flows

**`/gemini:setup`** invokes the companion's `setup --json` subcommand. The markdown command interprets the JSON and uses `AskUserQuestion` once if Gemini is missing and `npm` is available, offering install via `npm install -g @google/gemini-cli`.

**`/gemini:review`** mirrors the codex review.md UX — estimates review size via `git status` + `git diff --shortstat`, asks once whether to run foreground or background, then invokes the companion. The companion assembles a prompt that asks Gemini for a fixed markdown skeleton:

```
## Summary
<one-line ship/no-ship verdict>

### Critical
...

### High
...

### Medium
...

### Nits
...
```

**`/gemini:adversarial-review`** does the same but loads `prompts/adversarial-review.md` (adapted from codex's, with output-contract section rewritten for the markdown skeleton instead of JSON), accepts free-form focus text after flags.

**`/gemini:rescue`** routes through the `gemini:gemini-rescue` subagent. Subagent is a thin forwarder that calls `node gemini-companion.mjs task ...`. `--write` adds `--yolo` to the gemini invocation. `--background` translates to `run_in_background: true` on the agent's Bash call (no flag forwarded to the companion).

### Model handling

`--model <name>` passes through. Convenience aliases:

- `pro` → `gemini-2.5-pro`
- `flash` → `gemini-2.5-flash`

Default is unset; let Gemini pick its own default.

### Naming and branding

- Marketplace: `google-gemini` (parallel to `openai-codex`)
- Plugin: `gemini`
- Command namespace: `gemini:`
- Subagent id: `gemini:gemini-rescue`
- License: Apache-2.0 (matches codex-plugin-cc's choice; the repo redistributes no Gemini code, only shells out)

## Data flow

```
┌──────────────┐
│ User in      │
│ Claude Code  │ → /gemini:review --base main
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ commands/review.md   │ — estimates size, asks fg/bg, calls Bash
└──────┬───────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ scripts/gemini-companion.mjs    │
│   review subcommand             │
│     • parse args                │
│     • git diff + shortstat      │
│     • assemble prompt           │
│     • exec gemini --prompt      │
└──────┬──────────────────────────┘
       │
       ▼
┌──────────────┐
│ gemini CLI   │ → markdown text
└──────┬───────┘
       │
       ▼ stdout passthrough
       │
       ▼
┌──────────────┐
│ Claude Code  │ — renders markdown
└──────────────┘
```

## Error handling

All errors are non-throwing user messages (exit 0, message on stdout):

- **Gemini not installed** → setup explains how, optionally offers `npm install`
- **Gemini installed but unauthenticated** → suggest `!gemini auth login` (verify exact subcommand at first run)
- **Empty diff for review** → "no changes to review"
- **Network/quota errors from Gemini** → surface stderr verbatim, do not retry
- **`git` missing or not a repo** → "this command must run inside a Git repository"

The companion never throws past the top-level; it catches and renders friendly text.

## Testing

Unit tests under `tests/`, run with `node --test`:

- **`args.test.mjs`** — `parseArgs` flag handling (boolean, value, alias, passthrough), `splitRawArgumentString` quoting + escaping
- **`prompts.test.mjs`** — template loading, variable injection, escaping of injected diff content
- **`git.test.mjs`** — `resolveReviewTarget` (auto/working-tree/branch), diff collection against fixture repos created with shell helpers
- **`setup.test.mjs`** — install/auth-state detection mocked at the `which`/`spawn` boundary

No tests against the real `gemini` binary in CI — too flaky and adds external dep. Manual smoke procedure documented in README.

## Open implementation-time questions

These don't block design; resolved at first contact with the real `gemini` CLI:

1. **Exact non-interactive flag.** Current spec assumes `--prompt`. Verify against `gemini --help` at first run; `-p` may be equivalent.
2. **`--yolo` blast radius.** Does `--yolo` auto-approve only edits, or also shell-tool runs? Wording in `/gemini:rescue` `--write` warning depends on this.
3. **Auth state probe.** Cheapest reliable test for "Gemini is logged in." Candidates: existence of `~/.gemini/oauth_creds.json`, exit code of `gemini --prompt "ok" --max-tokens 1`, or a dedicated `gemini auth status` if it exists.
4. **Approval-mode behavior in non-interactive mode.** Does the default approval mode block when Gemini wants to edit a file in `--prompt` mode, or does it auto-decline and continue? Determines whether read-only rescue needs an explicit flag beyond just omitting `--yolo`.

## Versioning

v1.0.0 ships the four commands. v1.x can add:

- Stop-hook review gate (Q6 deferred)
- `--resume` via interactive REPL escape hatch (Q3 deferred)
- Structured JSON review output (Q5 deferred)
- Background job tracking parity with codex (Q1 dropped scope)

## What we're explicitly *not* doing

This is the discipline part: **resist drift toward codex parity** for codex-plugin-cc-shaped problems Gemini doesn't have. The codex plugin's complexity exists because Codex's app-server protocol enables (and requires) a JSON-RPC broker. Gemini's `--prompt` model is shell-pipeline-shaped; the plugin should be too.
