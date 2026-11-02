export interface PromptTemplate {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  /** Needs an attached image and a vision-capable model. */
  requiresImage?: boolean;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "screenshot-to-code",
    label: "Screenshot to code",
    icon: "code-icon",
    requiresImage: true,
    prompt:
      "Recreate the attached screenshot or mockup as UI code. First inspect the workspace to find the framework, component structure, and styling conventions, and match them. Reproduce the layout, spacing, colors, typography, and visible text as closely as you can, using semantic and accessible markup. Then propose the new or changed files. Mention anything in the image you could not determine and the assumptions you made.",
  },
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
