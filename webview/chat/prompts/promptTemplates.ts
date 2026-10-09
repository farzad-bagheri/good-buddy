export interface PromptTemplate {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "explain",
    label: "Explain this code",
    icon: "explain-icon",
    prompt:
      "Explain the attached code. Describe its purpose, how it works, and any important edge cases.",
  },
  {
    id: "tests",
    label: "Write tests",
    icon: "tests-icon",
    prompt:
      "Inspect the attached code and its existing test conventions. Suggest or implement focused tests for its main behavior and important edge cases.",
  },
  {
    id: "debug",
    label: "Find a bug",
    icon: "debug-icon",
    prompt:
      "Inspect the attached code for likely bugs or incorrect edge-case behavior. Explain any concrete findings and suggest the smallest safe fix.",
  },
  {
    id: "improve",
    label: "Improve this code",
    icon: "improve-icon",
    prompt:
      "Review the attached code for a focused improvement to clarity, maintainability, or performance. Preserve its existing behavior and explain any proposed changes.",
  },
];

export function insertPromptTemplate(draft: string, prompt: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n\n${prompt}` : prompt;
}
