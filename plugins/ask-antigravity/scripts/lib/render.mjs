export function renderSetupText(state) {
  const lines = [];
  if (!state.antigravity.installed) {
    lines.push("Antigravity CLI (agy) is not installed.");
    lines.push("");
    lines.push(`To install: ${state.installHint.primary}`);
    lines.push(`        or: ${state.installHint.alternate}`);
    lines.push("");
    lines.push("Prerequisites: Node.js (>= 18.18) on PATH.");
    return lines.join("\n");
  }

  lines.push(`Antigravity CLI: installed (${state.antigravity.version})`);

  if (!state.antigravity.supported) {
    lines.push("");
    lines.push(
      `This agy version (${state.antigravity.version}) predates the minimum this plugin supports — ` +
        "headless print mode hangs on older versions."
    );
    lines.push(`Please upgrade: ${state.installHint.primary}`);
    lines.push(`           or: brew upgrade antigravity-cli`);
    return lines.join("\n");
  }

  if (!state.auth.authenticated) {
    lines.push("");
    lines.push("Not authenticated. Run !agy and complete sign-in,");
    lines.push("or set ANTIGRAVITY_API_KEY in your environment.");
    return lines.join("\n");
  }

  lines.push(`Auth: ${state.auth.method}`);
  lines.push("");
  lines.push("Ready. Try /ask-antigravity:review or /ask-antigravity:rescue <task>.");
  return lines.join("\n");
}

export function renderSetupJson(state) {
  return JSON.stringify(
    {
      installed: state.antigravity.installed,
      version: state.antigravity.installed ? state.antigravity.version : null,
      supported: state.antigravity.installed ? Boolean(state.antigravity.supported) : false,
      authenticated: state.auth.authenticated,
      auth_method: state.auth.authenticated ? state.auth.method : null,
      ready: Boolean(
        state.antigravity.installed && state.antigravity.supported && state.auth.authenticated
      )
    },
    null,
    2
  );
}

export function renderReviewHeader({ summary, target, mode }) {
  const lines = [`> Antigravity ${mode}: ${summary}`];
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
