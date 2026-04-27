---
description: Delegate investigation, analysis, or a coding task to the Gemini rescue subagent
argument-hint: "[--background|--wait] [--write] [--model <pro|flash|name>] [what Gemini should investigate, analyze, or solve]"
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Invoke the `gemini:gemini-rescue` subagent via the `Agent` tool (`subagent_type: "gemini:gemini-rescue"`), forwarding the raw user request as the prompt.
`gemini:gemini-rescue` is a subagent, not a skill — do not call `Skill(gemini:gemini-rescue)` (no such skill) or `Skill(gemini:rescue)` (that re-enters this command and hangs the session). The command runs inline so the `Agent` tool stays in scope.
The final user-visible response must be Gemini's output verbatim.

Raw user request:
$ARGUMENTS

Execution mode:

- If the request includes `--background`, run the `gemini:gemini-rescue` subagent in the background.
- If the request includes `--wait`, run the subagent in the foreground.
- If neither flag is present, default to foreground.
- `--background` and `--wait` are execution flags for Claude Code. Do not forward them to `task`, and do not treat them as part of the natural-language task text.
- `--model` is a runtime-selection flag. Preserve it for the forwarded `task` call, but do not treat it as part of the natural-language task text.
- `--write` enables Gemini to edit files (uses `--yolo`). Preserve it for the forwarded `task` call. If the user did not pass `--write`, default to read-only — Gemini analyzes and proposes; Claude or the user applies.

Operating rules:

- The subagent is a thin forwarder only. It uses one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" task ...` and returns that command's stdout as-is.
- Return the Gemini companion stdout verbatim to the user.
- Do not paraphrase, summarize, rewrite, or add commentary before or after it.
- Do not ask the subagent to inspect files, monitor progress, summarize output, or do follow-up work of its own.
- Leave the model unset unless the user explicitly asks for one. If they ask for `pro` map it to `gemini-2.5-pro`; if they ask for `flash` map it to `gemini-2.5-flash`.
- If the user did not supply a request, ask what Gemini should investigate or solve.
- If the helper reports that Gemini is missing or unauthenticated, stop and tell the user to run `/gemini:setup`.
