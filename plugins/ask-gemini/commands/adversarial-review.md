---
description: Run a Gemini review that challenges the implementation approach and design choices
argument-hint: '[--wait|--background] [--base <ref>] [--model <pro|flash|name>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Run an adversarial Gemini review through the shared plugin runtime.
Position it as a challenge review that questions the chosen implementation, design choices, tradeoffs, and assumptions. It is not just a stricter pass over implementation defects.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Gemini's output verbatim to the user.
- Keep the framing focused on whether the current approach is the right one, what assumptions it depends on, and where the design could fail under real-world conditions.

Execution mode rules:
- If the raw arguments include `--wait`, do not ask. Run in the foreground.
- If the raw arguments include `--background`, do not ask. Run in a Claude background task.
- Otherwise, estimate the review size before asking:
  - Use `git status --short --untracked-files=all` to see scope.
  - Use `git diff --shortstat --cached` and `git diff --shortstat` for working-tree changes.
  - Use `git diff --shortstat <base>...HEAD` if `--base <ref>` was passed.
  - Treat untracked files as reviewable work even when diff stats are empty.
  - Recommend waiting only when the scoped review is clearly tiny (~1-2 files, no directory-scale change). Otherwise recommend background.
  - When in doubt, run the review rather than declaring there is nothing to review.
- Then use `AskUserQuestion` exactly once with two options, putting the recommended option first and suffixing its label with `(Recommended)`:
  - `Wait for results`
  - `Run in background`

Argument handling:
- Preserve the user's arguments exactly.
- Do not strip `--wait` or `--background` yourself.
- Do not weaken the adversarial framing or rewrite the user's focus text.
- The companion script accepts `--wait` and `--background` but treats them as no-ops; Claude Code's `Bash(..., run_in_background: true)` is what actually detaches the run.
- Free-form focus text after the flags is forwarded to Gemini as the user-focus area.

Foreground flow:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" adversarial-review "$ARGUMENTS"
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.
- Do not fix any issues mentioned in the review output.

Background flow:
- Launch the review with `Bash` in the background:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" adversarial-review "$ARGUMENTS"`,
  description: "Gemini adversarial review",
  run_in_background: true
})
```
- Do not call `BashOutput` or wait for completion in this turn.
- After launching, tell the user the adversarial review is running in the background and the output will appear in chat when it finishes.
- While waiting, completion arrives as a `BashOutput` notification from the harness. Do not poll temp directories, do not search for sidecar files (this plugin does not create any), and do not invoke `gemini` or the companion script directly to "check status" — that runs a separate gemini session and does not surface the in-flight one.
