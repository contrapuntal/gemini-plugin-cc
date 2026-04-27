import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(here, "..", "..", "prompts");

export function loadPrompt(name) {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  return fs.readFileSync(filePath, "utf8");
}

export function renderTemplate(template, variables) {
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const value = variables[key];
      return value == null ? "" : String(value);
    }
    return match;
  });
}

export function buildReviewPrompt({ targetLabel, summary, content }) {
  const template = loadPrompt("review");
  return renderTemplate(template, {
    TARGET_LABEL: targetLabel,
    REVIEW_SUMMARY: summary,
    REPOSITORY_CONTEXT: content
  });
}

export function buildAdversarialPrompt({ targetLabel, userFocus, summary, content }) {
  const template = loadPrompt("adversarial-review");
  return renderTemplate(template, {
    TARGET_LABEL: targetLabel,
    USER_FOCUS: userFocus || "(none provided — apply general adversarial framing)",
    REVIEW_SUMMARY: summary,
    REPOSITORY_CONTEXT: content
  });
}
