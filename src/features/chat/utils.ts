import { ChatMessage, ProviderModel } from "@/provider";
import type { ToolCall, ToolDefinition } from "./types";

export type AssistantEnvelope =
  | { type: "final"; response: string; title?: string; suggestions?: string[] }
  | { type: "tool_call"; tool: ToolCall; title?: string };

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function findRetryUserIndex(
  history: readonly ChatMessage[],
  assistantIndex: number,
): number | undefined {
  if (
    !Number.isInteger(assistantIndex) ||
    history[assistantIndex]?.role !== "assistant"
  ) {
    return undefined;
  }

  for (let index = assistantIndex - 1; index >= 0; index--) {
    if (history[index].role === "user") return index;
  }

  return undefined;
}

export function findMissingModels(
  availableModels: readonly string[],
  requiredModels: readonly string[],
): string[] {
  return [...new Set(requiredModels)].filter(
    (model) => !availableModels.includes(model),
  );
}

export type ModelSetupStatus =
  | "no-models"
  | "models-unselected"
  | "models-missing"
  | "ready";

export function getModelSetupStatus(
  availableModels: readonly string[],
  selectedModels: readonly string[],
): ModelSetupStatus {
  if (availableModels.length === 0) return "no-models";
  const configuredModels = selectedModels.filter(Boolean);
  if (findMissingModels(availableModels, configuredModels).length > 0) {
    return "models-missing";
  }
  if (selectedModels.some((model) => !model)) return "models-unselected";
  return "ready";
}

export function agentInstructions(
  model: ProviderModel,
  projectContext: string,
  tools: readonly ToolDefinition[],
  requestTitle: boolean,
): ChatMessage {
  const toolInstructions = tools
    .map((tool) => `- ${tool.id}: ${tool.description}`)
    .join("\n");
  const titleExample = requestTitle
    ? '"title":"Short descriptive title"'
    : '"title":null';
  return {
    role: "system",
    content: `You are Good Buddy, a concise coding assistant with workspace tools. Your technical details are as follows: ${JSON.stringify(model)}.
Every reply must be exactly one JSON object matching this contract, with no Markdown fences or surrounding prose:
{"type":"final","response":"Markdown answer","tool":null,"autoApprove":false,"arguments":{},${titleExample}, "suggestions": []}
{"type":"tool_call","response":"","tool":"tool_id","autoApprove":false,"arguments":{},${titleExample}}
Use type "final" when answering the user. The response value is Markdown and should contain the complete user-facing answer: finish every sentence and list, and do not end with an unfinished introduction or colon. Use type "tool_call" only when a listed tool is needed. For write_file, replace_in_file, run_command, and delete_file, always set autoApprove to false. The user must approve writes and commands through their confirmation UI; delete_file always requires its own explicit modal confirmation and moves only one file to the OS trash. A chat message such as "okay" does not execute or approve a pending operation.
${requestTitle ? "On this first response, include a short descriptive title in title. On later responses, set title to null." : "Set title to null."}
Only on type "final" replies, you may include a "suggestions" array with up to 2 short, specific follow-up replies the user could send next (each under 60 characters, phrased as something the user would say or as answer for your question). Omit or leave it empty when no natural follow-up exists; never suggest anything for tool_call replies.
Available tools:
${toolInstructions}
Current project context:\n${projectContext}\n\nWhen the user asks about or changes this project, inspect relevant files before answering. Do not stop after saying what you will do: request the next tool in the same response. Use replace_in_file only for small, localized edits when you have copied the exact unique oldText from read_file. For structural or broad changes, read the existing file and use write_file with its complete updated contents. If replace_in_file fails because oldText does not match exactly once, do not apologize or stop: read the file, reassess the change, and retry with the exact section or switch to write_file. The user must approve every write and command. Paths must be relative to the workspace. After a tool result, either request another tool or give the final answer. Never claim a write was applied unless its tool result explicitly starts with 'Wrote '. Approval alone is not completion; if a write is cancelled, denied, or errors, clearly say that the file was not changed.`,
  };
}

export function assistantResponseFormat(
  tools: readonly ToolDefinition[],
  requestTitle = false,
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      type: { type: "string", enum: ["final", "tool_call"] },
      response: { type: "string" },
      tool: {
        type: ["string", "null"],
        enum: [null, ...tools.map(({ id }) => id)],
      },
      autoApprove: { type: "boolean" },
      arguments: { type: "object", additionalProperties: true },
      title: requestTitle ? { type: "string" } : { type: ["string", "null"] },
      suggestions: {
        type: "array",
        items: { type: "string" },
        maxItems: 2,
      },
    },
    required: ["type", "response", "tool", "autoApprove", "arguments", "title"],
    additionalProperties: false,
  };
}

export function parseAssistantEnvelope(
  response: string,
  tools: readonly ToolDefinition[],
  titleRequired = false,
): AssistantEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(response);
  } catch {
    throw new Error("Response must be one valid JSON object.");
  }

  if (!isRecord(value)) throw new Error("Response must be a JSON object.");
  if (value.type !== "final" && value.type !== "tool_call") {
    throw new Error("Response type must be 'final' or 'tool_call'.");
  }

  if (typeof value.response !== "string") {
    throw new Error("Response field must be a string.");
  }
  if (
    typeof value.autoApprove !== "boolean" ||
    !isRecord(value.arguments)
  ) {
    throw new Error(
      "Response must include boolean autoApprove and object arguments.",
    );
  }
  if (titleRequired ? typeof value.title !== "string" : value.title !== null) {
    throw new Error(
      titleRequired
        ? "The first response must include a title."
        : "Title must be null after the first response.",
    );
  }
  if (
    value.suggestions !== undefined &&
    (!Array.isArray(value.suggestions) ||
      value.suggestions.length > 2 ||
      value.suggestions.some((suggestion) => typeof suggestion !== "string"))
  ) {
    throw new Error("Suggestions must be an array of up to two strings.");
  }

  const title = typeof value.title === "string" ? value.title : undefined;
  if (value.type === "final") {
    if (value.tool !== null) {
      throw new Error("A final response must set tool to null.");
    }
    return {
      type: "final",
      response: value.response,
      title,
      suggestions: value.suggestions,
    };
  }

  if (typeof value.tool !== "string") {
    throw new Error("A tool call must include a tool name.");
  }
  const tool = tools.find(({ id }) => id === value.tool);
  if (!tool) throw new Error(`Unknown tool '${value.tool}'.`);
  return {
    type: "tool_call",
    tool: {
      tool: tool.id,
      autoApprove: value.autoApprove,
      arguments: value.arguments,
    },
    title,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Retrieves the value of a specific argument from a tool call.
 * @param toolCall The tool call containing the arguments.
 * @param name The name of the argument to retrieve.
 * @returns The value of the specified argument as a non-empty string.
 * @throws An error if the argument is not a non-empty string.
 */
export function toolArgument(toolCall: ToolCall, name: string): string {
  const value = toolCall.arguments[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Tool argument '${name}' must be a non-empty string.`);
  }
  return value;
}
