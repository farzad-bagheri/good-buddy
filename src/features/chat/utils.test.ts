import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "./types";
import {
  assistantResponseFormat,
  findMissingModels,
  getModelSetupStatus,
  findRetryUserIndex,
  parseAssistantEnvelope,
} from "./utils";

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
        "The model returned malformed or incomplete structured output. Please try again.",
    });
  });

  it("falls back to plain text when structured output is malformed", () => {
    expect(parseAssistantEnvelope("A plain answer", tools)).toEqual({
      type: "final",
      response: "A plain answer",
    });
  });

  it("recovers a final answer when the model leaves quotes unescaped", () => {
    const malformed =
      '{"type":"final","response":"Spring says: "Hey, inject the property here."","tool":null}';

    expect(parseAssistantEnvelope(malformed, tools)).toEqual({
      type: "final",
      response: 'Spring says: "Hey, inject the property here."',
    });
  });

  it("does not expose a truncated structured response", () => {
    const truncated =
      '{"type":"final","response":"A long answer ends before the envelope';

    expect(parseAssistantEnvelope(truncated, tools)).toEqual({
      type: "final",
      response:
        "The model returned malformed or incomplete structured output. Please try again.",
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

describe("findRetryUserIndex", () => {
  const history = [
    { role: "user", content: "First question" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Second question" },
    { role: "assistant", content: "Second answer" },
  ] as const;

  it("finds the user turn belonging to the selected assistant response", () => {
    expect(findRetryUserIndex(history, 1)).toBe(0);
    expect(findRetryUserIndex(history, 3)).toBe(2);
  });

  it("rejects invalid indices and non-assistant messages", () => {
    expect(findRetryUserIndex(history, 2)).toBeUndefined();
    expect(findRetryUserIndex(history, 4)).toBeUndefined();
    expect(findRetryUserIndex(history, Number.NaN)).toBeUndefined();
  });
});

describe("findMissingModels", () => {
  it("returns only distinct configured models not installed locally", () => {
    expect(
      findMissingModels(
        ["qwen3:8b", "qwen2.5-coder:7b"],
        ["qwen3:8b", "moophlo/Qwen3-Coder-30B-A3B-Instruct-GGUF:latest"],
      ),
    ).toEqual(["moophlo/Qwen3-Coder-30B-A3B-Instruct-GGUF:latest"]);
  });

  describe("getModelSetupStatus", () => {
    it("recognizes an empty server model list", () => {
      expect(getModelSetupStatus([], ["chat", "completion"])).toBe("no-models");
    });

    it("asks for model choices when selections are empty", () => {
      expect(getModelSetupStatus(["chat"], ["", ""])).toBe("models-unselected");
    });

    it("detects selections that are no longer available", () => {
      expect(
        getModelSetupStatus(["chat"], ["chat", "removed-completion"]),
      ).toBe("models-missing");
    });

    it("marks setup ready once both selections are available", () => {
      expect(
        getModelSetupStatus(["chat", "completion"], ["chat", "completion"]),
      ).toBe("ready");
    });
  });

  it("does not repeat a model configured for both purposes", () => {
    expect(findMissingModels([], ["same:model", "same:model"])).toEqual([
      "same:model",
    ]);
  });
});
