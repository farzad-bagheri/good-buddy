import { ChatMessage } from "@/provider";
import { ToolDefinition } from "./tools";
import type { ToolCall } from "./types";

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function agentInstructions(
  projectContext: string,
  tools: readonly ToolDefinition[],
): ChatMessage {
  const toolInstructions = tools
    .map((tool) => `- ${tool.id}: ${tool.description}`)
    .join("\n");
  return {
    role: "system",
    content: `You are Good Buddy, a concise coding assistant with workspace tools.
Use a tool only when it helps answer the user's request. To request one, reply with ONLY this JSON object (no Markdown):
{"tool":"tool_id","arguments":{}}
Available tools:
${toolInstructions}
Current project context:\n${projectContext}\n\nWhen the user asks about or changes this project, inspect relevant files before answering. Do not stop after saying what you will do: request the next tool in the same response. For small edits, prefer replace_in_file. The user must approve every write and command. Paths must be relative to the workspace. After a tool result, either request another tool or give the final answer.`,
  };
}

export function parseToolCall(response: string): ToolCall | undefined {
  for (const json of jsonCandidates(response)) {
    try {
      const candidate = JSON.parse(json) as {
        tool?: unknown;
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

export function toolArgument(toolCall: ToolCall, name: string): string {
  const value = toolCall.arguments[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Tool argument '${name}' must be a non-empty string.`);
  }
  return value;
}
