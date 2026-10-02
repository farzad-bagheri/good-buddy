import type { NewTimelineItem, TimelineItem } from "./types";
import { createItemId } from "./utils";

type MessageTimelineItem = Extract<TimelineItem, { kind: "message" }>;

export interface HistoryMessage {
  role: MessageTimelineItem["role"];
  content: string;
  html?: string;
  historyIndex?: number;
  suggestions?: string[];
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
    suggestions: message.suggestions,
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
  updates: Partial<Pick<MessageTimelineItem, "text" | "html" | "suggestions">>,
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
  return items.map((item) =>
    item.kind === "commandProposal" && item.commandId === commandId
      ? {
          ...item,
          output: item.output || result,
          status: result.startsWith("Command failed:")
            ? "Command failed"
            : "Completed",
        }
      : item,
  );
}
