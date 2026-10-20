import { describe, expect, it } from "vitest";
import type { ProviderModel } from "@/provider";
import type { ToolDefinition } from "./types";
import {
  agentInstructions,
  assistantResponseFormat,
  extractJsonStringFieldPrefix,
  findMissingModels,
  getModelSetupStatus,
  findRetryUserIndex,
  parseAssistantEnvelope,
} from "./utils";

const tools: ToolDefinition[] = [
  {
    id: "file_exists",
    description: "Check whether a workspace file exists",
    execute: async () => "File exists",
  },
  {
    id: "read_file",
    description: "Read a workspace file",
    execute: async () => "contents",
  },
];

describe("extractJsonStringFieldPrefix", () => {
  it("extracts a partially streamed top-level JSON string and decodes escapes", () => {
    expect(
      extractJsonStringFieldPrefix(
        '{"type":"final","response":"First line\\nsecond \\"quoted',
        "response",
      ),
    ).toBe('First line\nsecond "quoted');
  });

  it("ignores matching keys in nested objects and preceding string values", () => {
    expect(
      extractJsonStringFieldPrefix(
        '{"title":"mentions \\"response\\":","meta":{"response":"hidden"},"response":"visible',
        "response",
      ),
    ).toBe("visible");
  });
});

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
          extras: {
            suggestions: ["Show me the changes"],
            files: [{ name: "index.ts", path: "src/index.ts" }],
            artifacts: [
              {
                type: "code",
                title: "Example function",
                language: "typescript",
                content: "export const answer = 42;",
              },
            ],
          },
        }),
        tools,
        true,
      ),
    ).toEqual({
      type: "final",
      response: "## Result\n\n**Done.**",
      title: "Summarize the result",
      extras: {
        suggestions: ["Show me the changes"],
        files: [{ name: "index.ts", path: "src/index.ts" }],
        artifacts: [
          {
            type: "code",
            title: "Example function",
            language: "typescript",
            content: "export const answer = 42;",
          },
        ],
      },
    });
  });

  it("accepts registered tool calls and ignores suggestions and files", () => {
    const valid = parseAssistantEnvelope(
      JSON.stringify({
        type: "tool_call",
        response: "",
        tool: "read_file",
        autoApprove: false,
        arguments: { path: "src/index.ts" },
        title: "Review the entry point",
        extras: { invalid: true },
      }),
      tools,
      true,
    );
    expect(valid).toMatchObject({
      type: "tool_call",
      tool: { tool: "read_file", arguments: { path: "src/index.ts" } },
    });

    const withoutUnusedFields = parseAssistantEnvelope(
      JSON.stringify({
        type: "tool_call",
        response: "",
        tool: "read_file",
        autoApprove: false,
        arguments: { path: "src/index.ts" },
        title: "Review the entry point",
      }),
      tools,
      true,
    );
    expect(withoutUnusedFields).toMatchObject({
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
          extras: { suggestions: [], files: [], artifacts: [] },
        }),
        tools,
      ),
    ).toThrow("Unknown tool 'unknown'.");
  });

  it("accepts namespaced tools registered by an external tool provider", () => {
    const externalTool: ToolDefinition = {
      id: "mcp__docs__search",
      description: "Search documentation",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      execute: async () => "Found documentation",
    };
    const response = JSON.stringify({
      type: "tool_call",
      response: "",
      tool: externalTool.id,
      autoApprove: false,
      arguments: { query: "MCP tools" },
      title: null,
    });

    expect(
      parseAssistantEnvelope(response, [...tools, externalTool]),
    ).toMatchObject({
      type: "tool_call",
      tool: {
        tool: "mcp__docs__search",
        arguments: { query: "MCP tools" },
      },
    });
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
          extras: { suggestions: [], files: [], artifacts: [] },
        }),
        tools,
      ),
    ).toMatchObject({
      type: "final",
      response: "Done",
      title: undefined,
      extras: { suggestions: [], files: [], artifacts: [] },
    });
  });

  it("validates response extras", () => {
    const base = {
      type: "final",
      response: "Done",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
      extras: { suggestions: [], files: [], artifacts: [] },
    };
    const parse = (overrides: Record<string, unknown>) =>
      parseAssistantEnvelope(JSON.stringify({ ...base, ...overrides }), tools);

    expect(
      parse({
        extras: {
          suggestions: ["A short follow-up", "Another one"],
          files: [{ name: "index.ts", path: "src/index.ts" }],
          artifacts: [
            {
              type: "code",
              title: "Example",
              language: "typescript",
              content: "const answer = 42;",
            },
            {
              type: "svg",
              title: "Circle diagram",
              language: "svg",
              content:
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>',
            },
          ],
        },
      }),
    ).toMatchObject({
      extras: {
        suggestions: ["A short follow-up", "Another one"],
        files: [{ name: "index.ts", path: "src/index.ts" }],
        artifacts: [
          {
            type: "code",
            title: "Example",
            language: "typescript",
            content: "const answer = 42;",
          },
          {
            type: "svg",
            title: "Circle diagram",
            language: "svg",
            content:
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>',
          },
        ],
      },
    });
    expect(() =>
      parse({ extras: { suggestions: [""], files: [], artifacts: [] } }),
    ).toThrow("Extras must contain valid");
    expect(() =>
      parse({
        extras: { suggestions: ["x".repeat(60)], files: [], artifacts: [] },
      }),
    ).toThrow("Extras must contain valid");
    expect(() =>
      parse({
        extras: {
          suggestions: [],
          files: [{ name: " ", path: "src/index.ts" }],
          artifacts: [],
        },
      }),
    ).toThrow("Extras must contain valid");
    expect(() =>
      parse({
        extras: {
          suggestions: [],
          files: [],
          artifacts: [
            {
              type: "html",
              title: "Invalid",
              language: "html",
              content: "<h1>Hello</h1>",
            },
          ],
        },
      }),
    ).toThrow("Extras must contain valid");
    expect(() =>
      parse({
        extras: {
          suggestions: [],
          files: [],
          artifacts: [
            {
              type: "svg",
              title: "Invalid SVG language",
              language: "xml",
              content: "<svg />",
            },
          ],
        },
      }),
    ).toThrow("Extras must contain valid");
    expect(() =>
      parse({
        extras: {
          suggestions: [],
          files: [],
          artifacts: [{ type: "code", title: "Empty" }],
        },
      }),
    ).toThrow("Extras must contain valid");
    expect(parse({})).toMatchObject({
      extras: { suggestions: [], files: [], artifacts: [] },
    });
    expect(() =>
      parse({ extras: { suggestions: [] } }),
    ).toThrow("Extras must contain valid");
  });

  it("requires a non-empty title on the first response and null on later responses", () => {
    const response = {
      type: "final",
      response: "Done",
      tool: null,
      autoApprove: false,
      arguments: {},
      extras: { suggestions: [], files: [], artifacts: [] },
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
        tool: { enum: [null, "file_exists", "read_file"] },
        extras: {
          required: ["suggestions", "files", "artifacts"],
          properties: {
            suggestions: { type: "array" },
            files: { type: "array" },
            artifacts: {
              type: "array",
              items: {
                properties: {
                  type: { enum: ["code", "svg"] },
                },
              },
            },
          },
        },
      },
      required: expect.arrayContaining(["extras", "title"]),
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
      'When the user asks you to write, generate, provide, or return code, put the complete requested code in an "extras.artifacts" item',
    );
    expect(prompt).toContain(
      "do not put the same complete code in a Markdown fence",
    );
    expect(prompt).toContain(
      'return it as an "extras.artifacts" item with type "svg", language "svg"',
    );
    expect(prompt).toContain(
      "If the user asks to change workspace files, use the workspace tools and approval flow",
    );
    expect(prompt).toContain(
      "For structural or broad changes, read the existing file and use write_file",
    );
    expect(prompt).toContain(
      "If replace_in_file fails because oldText does not match exactly once",
    );
    expect(prompt).toContain(
      "Before saying a requested file already exists, call file_exists",
    );
    expect(prompt).toContain(
      'Only say you created or updated a file after a write tool returns a result beginning with "Wrote "',
    );
    expect(prompt).toContain('"suggestions":[],"files":[]');
  });

  it("includes external tool argument schemas in the agent instructions", () => {
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
        {
          id: "mcp__docs__search",
          description: "Search documentation",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
          },
          execute: async () => "",
        },
      ],
      false,
    );

    expect(prompt.content).toContain(
      'Arguments schema: {"type":"object","properties":{"query":{"type":"string"}}}',
    );
  });

  it("explains the host environment available to run_command", () => {
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
          id: "run_command",
          description: "Run a command on the extension host",
          execute: async () => "",
        },
      ],
      false,
    ).content;

    expect(prompt).toContain(
      "For requests to check installed software or host environment, use run_command",
    );
    expect(prompt).toContain(
      "do not claim the host OS or shell is inaccessible or sandboxed to workspace files",
    );
    expect(prompt).toContain(
      "this is the extension host's environment, which may differ from the user's local machine",
    );
  });

  it("instructs retries to verify file state instead of assuming prior writes", () => {
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
      tools,
      false,
      true,
    ).content;

    expect(prompt).toContain("This is a retry of the user's original request");
    expect(prompt).toContain(
      "read_file distinguishes a missing file from an existing empty file",
    );
    expect(prompt).toContain(
      "Do not assume a file was created because a previous response said so",
    );
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
