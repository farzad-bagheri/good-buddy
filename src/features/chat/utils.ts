import { ChatMessage } from "@/provider";
import type { ToolCall, ToolDefinition } from "./types";

export type AssistantEnvelope =
  | { type: "final"; response: string; title?: string }
  | { type: "tool_call"; tool: ToolCall; title?: string };

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function agentInstructions(
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
    content: `You are Good Buddy, a concise coding assistant with workspace tools.
Every reply must be exactly one JSON object matching this contract, with no Markdown fences or surrounding prose:
{"type":"final","response":"Markdown answer","tool":null,"autoApprove":false,"arguments":{},${titleExample}}
{"type":"tool_call","response":"","tool":"tool_id","autoApprove":false,"arguments":{},${titleExample}}
Use type "final" when answering the user. The response value is Markdown and should contain the complete user-facing answer. Use type "tool_call" only when a listed tool is needed. For write_file, replace_in_file, and run_command, always set autoApprove to false. The user must approve these actions with the proposal UI; a chat message such as "okay" does not execute or approve a pending tool call.
${requestTitle ? "On this first response, include a short descriptive title in title. On later responses, set title to null." : "Set title to null."}
Available tools:
${toolInstructions}
Current project context:\n${projectContext}\n\nWhen the user asks about or changes this project, inspect relevant files before answering. Do not stop after saying what you will do: request the next tool in the same response. For small edits, prefer replace_in_file. The user must approve every write and command. Paths must be relative to the workspace. After a tool result, either request another tool or give the final answer. Never claim a write was applied unless its tool result explicitly starts with 'Wrote '. Approval alone is not completion; if a write is cancelled, denied, or errors, clearly say that the file was not changed.`,
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
    },
    required: ["type", "response", "tool", "autoApprove", "arguments", "title"],
    additionalProperties: false,
  };
}

export function parseAssistantEnvelope(
  response: string,
  tools: readonly ToolDefinition[],
): AssistantEnvelope {
  for (const json of jsonCandidates(response)) {
    try {
      const candidate: unknown = JSON.parse(json);
      if (!candidate || typeof candidate !== "object") continue;

      const value = candidate as Record<string, unknown>;
      const title =
        typeof value.title === "string" && value.title.trim()
          ? value.title.trim().slice(0, 80)
          : undefined;

      if (value.type === "final" && typeof value.response === "string") {
        return { type: "final", response: value.response, title };
      }

      if (
        value.type === "tool_call" &&
        typeof value.tool === "string" &&
        tools.some(({ id }) => id === value.tool) &&
        typeof value.autoApprove === "boolean" &&
        isRecord(value.arguments)
      ) {
        return {
          type: "tool_call",
          tool: {
            tool: value.tool as ToolCall["tool"],
            autoApprove: value.autoApprove,
            arguments: value.arguments,
          },
          title,
        };
      }
    } catch {
      // A model may ignore the requested JSON format.
    }
  }

  return { type: "final", response: response.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseToolCall(response: string): ToolCall | undefined {
  for (const json of jsonCandidates(response)) {
    try {
      const candidate = JSON.parse(json) as {
        tool?: unknown;
        autoApprove?: unknown;
        arguments?: unknown;
      };
      if (
        candidate &&
        typeof candidate === "object" &&
        typeof candidate.tool === "string" &&
        (candidate.arguments === undefined ||
          (typeof candidate.arguments === "object" &&
            candidate.arguments !== null &&
            !Array.isArray(candidate.arguments)))
      ) {
        return {
          tool: candidate.tool,
          autoApprove: candidate.autoApprove === true,
          arguments: (candidate.arguments ?? {}) as Record<string, unknown>,
        } as ToolCall;
      }
    } catch {
      // Models may wrap valid JSON in prose or a code fence.
    }
  }
  return undefined;
}

/**
 * Extracts potential JSON tool calls from a response string.
 * @param response The response string potentially containing JSON tool calls.
 * @returns An array of JSON strings extracted from the response, including potential tool calls.
 */
function jsonCandidates(response: string): string[] {
  const candidates = [response.trim()];
  const tagged = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i.exec(
    response,
  )?.[1];
  if (tagged) candidates.push(tagged);
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(response)?.[1];
  if (fenced) candidates.push(fenced);

  const start = response.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < response.length; index++) {
      const char = response[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        candidates.push(response.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates;
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
