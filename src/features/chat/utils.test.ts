import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "./types";
import { assistantResponseFormat, parseAssistantEnvelope } from "./utils";

const tools: ToolDefinition[] = [
  {
    id: "read_file",
    description: "Read a workspace file",
    execute: async () => "contents",
  },
];

describe("assistant response envelope", () => {
  it("preserves Markdown and a suggested title in final responses", () => {
    expect(
      parseAssistantEnvelope(
        JSON.stringify({
          type: "final",
          response: "## Result\n\n**Done.**",
          title: "Summarize the result",
        }),
        tools,
      ),
    ).toEqual({
      type: "final",
      response: "## Result\n\n**Done.**",
      title: "Summarize the result",
    });
  });

  it("accepts only tool calls matching registered tools", () => {
    const valid = parseAssistantEnvelope(
      JSON.stringify({
        type: "tool_call",
        response: "",
        tool: "read_file",
        autoApprove: false,
        arguments: { path: "src/index.ts" },
        title: null,
      }),
      tools,
    );
    expect(valid).toMatchObject({
      type: "tool_call",
      tool: { tool: "read_file", arguments: { path: "src/index.ts" } },
    });

    expect(
      parseAssistantEnvelope(
        '{"type":"tool_call","tool":"unknown","autoApprove":false,"arguments":{}}',
        tools,
      ),
    ).toEqual({
      type: "final",
      response:
        '{"type":"tool_call","tool":"unknown","autoApprove":false,"arguments":{}}',
    });
  });

  it("falls back to plain text when structured output is malformed", () => {
    expect(parseAssistantEnvelope("A plain answer", tools)).toEqual({
      type: "final",
      response: "A plain answer",
    });
  });

  it("limits tool names in the Ollama response schema", () => {
    expect(assistantResponseFormat(tools)).toMatchObject({
      type: "object",
      properties: {
        tool: { enum: [null, "read_file"] },
      },
    });
  });

  it("requires a title in the first-response schema", () => {
    expect(assistantResponseFormat(tools, true)).toMatchObject({
      properties: { title: { type: "string" } },
    });
  });
});
