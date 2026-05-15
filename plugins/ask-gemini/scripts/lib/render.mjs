export function renderSetupText(state) {
  const lines = [];
  if (!state.gemini.installed) {
    lines.push("Gemini CLI is not installed.");
    if (state.npm.available) {
      lines.push("");
      lines.push("To install: npm install -g @google/gemini-cli");
    } else {
      lines.push("");
      lines.push(`Install Node.js (>= 18.18) and then: npm install -g @google/gemini-cli`);
    }
    return lines.join("\n");
  }

  lines.push(`Gemini CLI: installed (${state.gemini.version})`);

  if (!state.auth.authenticated) {
    lines.push("");
    lines.push("Not authenticated. Run !gemini and complete sign-in,");
    lines.push("or set GEMINI_API_KEY in your environment.");
    return lines.join("\n");
  }

  lines.push(`Auth: ${state.auth.method}`);
  lines.push("");
  lines.push("Ready. Try /ask-gemini:review or /ask-gemini:rescue <task>.");
  return lines.join("\n");
}

export function renderSetupJson(state) {
  return JSON.stringify(
    {
      installed: state.gemini.installed,
      version: state.gemini.installed ? state.gemini.version : null,
      authenticated: state.auth.authenticated,
      auth_method: state.auth.authenticated ? state.auth.method : null,
      npm_available: state.npm.available,
      ready: state.gemini.installed && state.auth.authenticated
    },
    null,
    2
  );
}

export function renderReviewHeader({ summary, target, mode }) {
  const lines = [`> Gemini ${mode}: ${summary}`];
  if (target?.label) {
    lines.push(`> Target: ${target.label}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return `Error: ${message}`;
}
