import type { NewTimelineItem, ResponseExtras, TimelineItem } from "./types";
import { createItemId } from "./utils";

type MessageTimelineItem = Extract<TimelineItem, { kind: "message" }>;

export interface HistoryMessage {
  role: MessageTimelineItem["role"];
  content: string;
  html?: string;
  historyIndex?: number;
  extras?: ResponseExtras;
}

export function formatToolActivity(
  tool: string,
  arguments_: Record<string, unknown> = {},
): string {
  const filePath =
    typeof arguments_.path === "string" ? ` ${arguments_.path}` : "";
  const activities: Record<string, string> = {
    inspect_project: "Inspecting project...",
    list_project: "Browsing project files...",
    search_files: "Finding files...",
    search_file_contents: "Searching file contents...",
    file_exists: `Checking file${filePath}...`,
    read_file: `Reading${filePath}...`,
    get_diagnostics: "Checking diagnostics...",
    find_references: `Finding references${filePath}...`,
    write_file: `Preparing file write${filePath}...`,
    replace_in_file: `Preparing file edit${filePath}...`,
    delete_file: `Requesting confirmation to delete${filePath}...`,
    run_command: "Requesting command approval...",
    install_dependencies: "Requesting dependency install approval...",
    run_project_checks: "Requesting project checks approval...",
    run_package_script: "Requesting script approval...",
  };
  const activity = activities[tool];
  if (activity) return activity;
  if (tool.startsWith("mcp:")) {
    return `Requesting approval for ${tool.slice("mcp:".length)}...`;
  }
  return `Running ${tool}...`;
}

export function mapHistoryToTimelineItems(
  messages: readonly HistoryMessage[],
): TimelineItem[] {
  return messages.map((message) => ({
    id: createItemId(),
    kind: "message",
    role: message.role,
    text: message.content,
    html: message.html,
    historyIndex: message.historyIndex,
    extras: message.extras,
  }));
}

export function appendTimelineItem(
  items: TimelineItem[],
  item: NewTimelineItem,
  id = createItemId(),
): TimelineItem[] {
  return [...items, { ...item, id } as TimelineItem];
}

export function appendCommandProposal(
  items: TimelineItem[],
  commandId: string,
  command: string,
  autoApproved: boolean,
): TimelineItem[] {
  const existing = items.find(
    (item) => item.kind === "commandProposal" && item.commandId === commandId,
  );
  if (existing?.kind === "commandProposal") {
    return items.map((item) =>
      item === existing
        ? {
            ...item,
            command,
            autoApproved,
            status: autoApproved ? "Running command..." : item.status,
          }
        : item,
    );
  }

  return appendTimelineItem(items, {
    kind: "commandProposal",
    commandId,
    command,
    autoApproved,
    output: "",
    status: autoApproved ? "Running command..." : undefined,
  });
}

export function updateAssistantMessage(
  items: TimelineItem[],
  id: string,
  updates: Partial<
    Pick<
      MessageTimelineItem,
      "text" | "html" | "extras"
    >
  >,
): TimelineItem[] {
  return items.map((item) =>
    item.id === id && item.kind === "message" && item.role === "assistant"
      ? { ...item, ...updates }
      : item,
  );
}

export function updateWriteProposal(
  items: TimelineItem[],
  proposalId: string,
  result: string,
): TimelineItem[] {
  return items.map((item) =>
    item.kind === "writeProposal" && item.proposalId === proposalId
      ? {
          ...item,
          status:
            result === "Write denied by the user."
              ? "Rejected"
              : result.startsWith("Wrote ")
                ? "Applied"
                : `Not applied: ${result}`,
        }
      : item,
  );
}

export function appendCommandOutput(
  items: TimelineItem[],
  commandId: string,
  text: string,
): TimelineItem[] {
  return items.map((item) =>
    item.kind === "commandProposal" && item.commandId === commandId
      ? { ...item, output: item.output + text }
      : item,
  );
}

export function completeCommandProposal(
  items: TimelineItem[],
  commandId: string,
  result: string,
): TimelineItem[] {
  const parsedResult = parseCommandResult(result);
  return items.map((item) =>
    item.kind === "commandProposal" && item.commandId === commandId
      ? {
          ...item,
          output: item.output || parsedResult?.output || result,
          status: result === "Command denied by the user."
            ? "Rejected"
            : result.startsWith("Command failed:") ||
                parsedResult?.status === "failed"
              ? "Command failed"
              : "Completed",
        }
      : item,
  );
}

function parseCommandResult(
  result: string,
): { status: "succeeded" | "failed"; output: string } | undefined {
  try {
    const value: unknown = JSON.parse(result);
    if (
      typeof value !== "object" ||
      value === null ||
      !["succeeded", "failed"].includes((value as { status?: unknown }).status as string)
    ) {
      return undefined;
    }
    const { status, output, error } = value as {
      status: "succeeded" | "failed";
      output?: unknown;
      error?: unknown;
    };
    const text = typeof output === "string" && output.trim()
      ? output
      : typeof error === "string"
        ? error
        : "";
    return { status, output: text };
  } catch {
    return undefined;
  }
}
