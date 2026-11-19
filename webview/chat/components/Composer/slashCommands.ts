import { PROMPT_TEMPLATES } from "../../prompts";
import type { WorkspaceSkill } from "../../types";

export type SlashCommand =
  | { kind: "prompt"; id: string; label: string; description: string; prompt: string; icon: string; requiresImage?: boolean }
  | { kind: "action"; id: string; label: string; description: string; icon: string }
  | { kind: "skill"; id: string; label: string; description: string; skill: WorkspaceSkill; icon?: never };

export function getSlashQuery(text: string, cursor: number): { start: number; end: number; query: string } | undefined {
  const prefix = text.slice(0, cursor);
  const match = /(?:^|\s)\/([a-z0-9-]*)$/i.exec(prefix);
  if (!match) return undefined;
  return { start: cursor - match[1].length - 1, end: cursor, query: match[1].toLowerCase() };
}

export function getSlashCommands(skills: WorkspaceSkill[], query: string): SlashCommand[] {
  const prompts: SlashCommand[] = PROMPT_TEMPLATES.map((template) => ({
    kind: "prompt",
    id: template.id,
    label: template.label,
    description: "Insert prompt",
    prompt: template.prompt,
    icon: template.icon,
    requiresImage: template.requiresImage,
  }));
  const actions: SlashCommand[] = [
    { kind: "action", id: "attach-files", label: "Attach files", description: "Attach text or image files", icon: "add-icon" },
    { kind: "action", id: "attach-selection", label: "Attach selection", description: "Attach selected editor code", icon: "selection-icon" },
    { kind: "action", id: "attach-terminal", label: "Attach terminal", description: "Attach active terminal output", icon: "terminal-icon" },
    { kind: "action", id: "attach-problems", label: "Attach problems", description: "Attach errors and warnings", icon: "problems-icon" },
    { kind: "action", id: "review-changes", label: "Review changes", description: "Review current Git changes", icon: "git-icon" },
  ];
  const skillCommands: SlashCommand[] = skills.map((skill) => ({
    kind: "skill",
    id: skill.id,
    label: skill.name,
    description: `${skill.description} — ${skill.location}`,
    skill,
  }));
  return [...prompts, ...actions, ...skillCommands].filter(
    (command) => command.label.toLowerCase().includes(query) || command.id.toLowerCase().includes(query),
  );
}
