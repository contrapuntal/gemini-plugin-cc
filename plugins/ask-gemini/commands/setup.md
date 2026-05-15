---
description: Check whether the local Gemini CLI is installed and authenticated
argument-hint: ''
allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" setup --json
```

If the JSON result has `installed: false` and `npm_available: true`:
- Use `AskUserQuestion` exactly once to ask whether Claude should install the Gemini CLI now.
- Put the install option first and suffix it with `(Recommended)`.
- Use these two options:
  - `Install Gemini CLI (Recommended)`
  - `Skip for now`
- If the user chooses install, run:

```bash
npm install -g @google/gemini-cli
```

- Then rerun:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" setup
```

If the JSON result has `installed: true` and `authenticated: false`:
- Tell the user to run `!gemini` and complete sign-in (Google account or `GEMINI_API_KEY`).

If the JSON result has `ready: true`:
- Show a brief confirmation and mention `/ask-gemini:review` and `/ask-gemini:rescue` as the next things to try.

Output rules:
- Present the final setup output to the user (the human-readable rerun, not the JSON).
- Do not paraphrase the install/auth instructions; surface them verbatim.
