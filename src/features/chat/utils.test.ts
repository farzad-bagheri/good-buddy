import { describe, expect, it } from "vitest";
import type { ProviderModel } from "@/provider";
import type { ToolDefinition } from "./types";
import {
  agentInstructions,
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
          tool: null,
          autoApprove: false,
          arguments: {},
          suggestions: ["Show me the changes"],
          files: [{ name: "index.ts", path: "src/index.ts" }],
        }),
        tools,
        true,
      ),
    ).toEqual({
      type: "final",
      response: "## Result\n\n**Done.**",
      title: "Summarize the result",
      suggestions: ["Show me the changes"],
      files: [{ name: "index.ts", path: "src/index.ts" }],
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
        title: "Review the entry point",
        suggestions: [],
        files: [],
      }),
      tools,
      true,
    );
    expect(valid).toMatchObject({
      type: "tool_call",
      tool: { tool: "read_file", arguments: { path: "src/index.ts" } },
    });

    expect(() =>
      parseAssistantEnvelope(
        JSON.stringify({
          type: "tool_call",
          response: "",
          tool: "unknown",
          autoApprove: false,
          arguments: {},
          title: null,
          suggestions: [],
          files: [],
        }),
        tools,
      ),
    ).toThrow("Unknown tool 'unknown'.");
  });

  it("accepts null titles after the initial response", () => {
    expect(
      parseAssistantEnvelope(
        JSON.stringify({
          type: "final",
          response: "Done",
          tool: null,
          autoApprove: false,
          arguments: {},
          title: null,
          suggestions: [],
          files: [],
        }),
        tools,
      ),
    ).toMatchObject({
      type: "final",
      response: "Done",
      title: undefined,
      suggestions: [],
      files: [],
    });
  });

  it("validates suggestion and file values", () => {
    const base = {
      type: "final",
      response: "Done",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
      suggestions: [],
      files: [],
    };
    const parse = (overrides: Record<string, unknown>) =>
      parseAssistantEnvelope(JSON.stringify({ ...base, ...overrides }), tools);

    expect(
      parse({
        suggestions: ["A short follow-up", "Another one"],
        files: [{ name: "index.ts", path: "src/index.ts" }],
      }),
    ).toMatchObject({
      suggestions: ["A short follow-up", "Another one"],
      files: [{ name: "index.ts", path: "src/index.ts" }],
    });
    expect(() => parse({ suggestions: [""] })).toThrow("Suggestions must be");
    expect(() => parse({ suggestions: ["x".repeat(60)] })).toThrow(
      "Suggestions must be",
    );
    expect(() => parse({ files: [{ name: " ", path: "src/index.ts" }] })).toThrow(
      "Files must be",
    );
    expect(() => {
      const withoutFiles: Record<string, unknown> = { ...base };
      delete withoutFiles.files;
      parseAssistantEnvelope(JSON.stringify(withoutFiles), tools);
    }).toThrow("Files must be");
  });

  it("requires a non-empty title on the first response and null on later responses", () => {
    const response = {
      type: "final",
      response: "Done",
      tool: null,
      autoApprove: false,
      arguments: {},
      suggestions: [],
      files: [],
    };
    expect(() =>
      parseAssistantEnvelope(
        JSON.stringify({ ...response, title: "  " }),
        tools,
        true,
      ),
    ).toThrow("The first response must include a title.");
    expect(() =>
      parseAssistantEnvelope(
        JSON.stringify({ ...response, title: "Unexpected title" }),
        tools,
        false,
      ),
    ).toThrow("Title must be null after the first response.");
  });

  it("rejects plain text rather than treating it as a final answer", () => {
    expect(() => parseAssistantEnvelope("A plain answer", tools)).toThrow(
      "Response must be one valid JSON object.",
    );
  });

  it("rejects malformed JSON without attempting to recover answer text", () => {
    const malformed =
      '{"type":"final","response":"Spring says: "Hey, inject the property here."","tool":null}';

    expect(() => parseAssistantEnvelope(malformed, tools)).toThrow(
      "Response must be one valid JSON object.",
    );
  });

  it("rejects truncated JSON", () => {
    const truncated =
      '{"type":"final","response":"A long answer ends before the envelope';

    expect(() => parseAssistantEnvelope(truncated, tools)).toThrow(
      "Response must be one valid JSON object.",
    );
  });

  it("limits tool names in the Ollama response schema", () => {
    expect(assistantResponseFormat(tools)).toMatchObject({
      type: "object",
      properties: {
        tool: { enum: [null, "read_file"] },
      },
      required: expect.arrayContaining(["suggestions", "files", "title"]),
    });
  });

  it("requires a title in the first-response schema", () => {
    expect(assistantResponseFormat(tools, true)).toMatchObject({
      properties: { title: { type: "string" } },
    });
  });

  it("allows only a null title after the first response", () => {
    expect(assistantResponseFormat(tools)).toMatchObject({
      properties: { title: { type: "null" } },
    });
  });

  it("guides exact localized replacements and full-file structural edits", () => {
    const prompt = agentInstructions(
      {
        caption: "Test model",
        name: "test",
        model: "test",
        details: {
          format: "",
          family: "",
          parameter_size: "",
          quantization_level: "",
          context_length: 0,
          embedding_length: 0,
        },
        capabilities: [],
      } satisfies ProviderModel,
      "Workspace root: test",
      [
        ...tools,
        {
          id: "replace_in_file",
          description: "Replace an exact unique section",
          execute: async () => "",
        },
        {
          id: "write_file",
          description: "Write complete file contents",
          execute: async () => "",
        },
      ],
      false,
    ).content;

    expect(prompt).toContain(
      "Use replace_in_file only for small, localized edits",
    );
    expect(prompt).toContain(
      "finish every sentence and list, and do not end with an unfinished introduction or colon",
    );
    expect(prompt).toContain(
      "For structural or broad changes, read the existing file and use write_file",
    );
    expect(prompt).toContain(
      "If replace_in_file fails because oldText does not match exactly once",
    );
    expect(prompt).toContain('"suggestions":[],"files":[]');
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
