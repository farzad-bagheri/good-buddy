import { describe, expect, it, vi } from "vitest";
import type {
  ChatOptions,
  GoodBuddyProvider,
  ProviderModel,
} from "@/provider";
import type { ToolDefinition } from "../types";
import { ChatAgent } from "./ChatAgent";

function createProvider(chat: GoodBuddyProvider["chat"]) {
  const chatWithMetadata: GoodBuddyProvider["chatWithMetadata"] = async (
    options,
    signal,
  ) => ({ content: await chat(options, signal) });
  const chatStream: GoodBuddyProvider["chatStream"] = async (
    options,
    onChunk,
    signal,
  ) => {
    const result = await chatWithMetadata(options, signal);
    onChunk(result.content);
    return result.content;
  };
  const chatStreamWithMetadata: GoodBuddyProvider["chatStreamWithMetadata"] =
    async (options, onChunk, signal) => {
      const result = await chatWithMetadata(options, signal);
      onChunk(result.content);
      return result;
    };
  return {
    chat,
    chatWithMetadata,
    generate: vi.fn(),
    chatStream,
    chatStreamWithMetadata,
    listModels: vi.fn(),
  };
}

describe("ChatAgent", () => {
  it("streams only the user-facing response field from the structured output", async () => {
    const response = JSON.stringify({
      type: "final",
      response: "A **streamed** answer.",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: "Answer me",
      suggestions: [],
      files: [],
    });
    const valueStart =
      response.indexOf('"response":"') + '"response":"'.length;
    const streamChunks = [
      response.slice(0, valueStart),
      "A **str",
      "eamed** answer.",
      response.slice(valueStart + "A **streamed** answer.".length),
    ];
    const provider = {
      ...createProvider(async () => response),
      chatStreamWithMetadata: async (
        _options: ChatOptions,
        onChunk: (text: string) => void,
      ) => {
        for (const chunk of streamChunks) onChunk(chunk);
        return { content: response };
      },
    };
    const onAssistantResponse = vi.fn();
    const agent = new ChatAgent(
      provider,
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      { list: () => [], execute: vi.fn() } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
        onAssistantResponse,
      },
    );

    await agent.run(
      [{ role: "user", content: "Answer me" }],
      { model: "qwen3:8b" } as unknown as ProviderModel,
      new AbortController().signal,
    );

    expect(onAssistantResponse.mock.calls.map(([text]) => text)).toEqual([
      "A **str",
      "A **streamed** answer.",
    ]);
  });

  it("preserves image attachments in the provider conversation", async () => {
    const chat = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "final",
        response: "It is a screenshot.",
        tool: null,
        autoApprove: false,
        arguments: {},
        title: "Describe screenshot",
        suggestions: [],
        files: [],
      }),
    );
    const agent = new ChatAgent(
      createProvider(chat as GoodBuddyProvider["chat"]),
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      { list: () => [], execute: vi.fn() } as never,
      { onToolStatus: vi.fn(), onModelStatus: vi.fn() },
    );
    const image = {
      name: "screenshot.png",
      mimeType: "image/png" as const,
      data: "aGVsbG8=",
    };

    await agent.run(
      [{ role: "user", content: "Describe this.", images: [image] }],
      { model: "vision-model" } as unknown as ProviderModel,
      new AbortController().signal,
    );

    expect(chat.mock.calls[0][0].messages.at(-1)).toEqual({
      role: "user",
      content: "Describe this.",
      images: [image],
    });
  });

  it("executes structured tool calls and returns the final Markdown and title", async () => {
    const toolResponse = JSON.stringify({
      type: "tool_call",
      response: "",
      tool: "read_file",
      autoApprove: false,
      arguments: { path: "src/index.ts" },
      title: "Review the entry point",
      suggestions: [],
      files: [],
    });
    const finalResponse = JSON.stringify({
      type: "final",
      response: "## Findings\n\nNo issues found.",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
      suggestions: ["Show the relevant code"],
      files: [{ name: "index.ts", path: "src/index.ts" }],
    });
    const chat = vi
      .fn()
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(finalResponse);
    const provider = createProvider(chat as GoodBuddyProvider["chat"]);
    const tool: ToolDefinition = {
      id: "read_file",
      description: "Read a workspace file",
      execute: vi.fn(),
    };
    const execute = vi.fn().mockResolvedValue("file contents");
    const workspaceTools = {
      projectContext: vi.fn().mockResolvedValue("project context"),
    };
    const tools = {
      list: () => [tool],
      execute,
    };
    const events = {
      onToolStatus: vi.fn(),
      onModelStatus: vi.fn(),
    };
    const agent = new ChatAgent(
      provider,
      { appendLine: vi.fn() },
      workspaceTools as never,
      tools as never,
      events,
    );

    await expect(
      agent.run(
        [{ role: "user", content: "Review the entry point" }],
        {
          model: "qwen3:8b",
        } as unknown as ProviderModel,
        AbortSignal.abort(),
      ),
    ).resolves.toEqual({
      response: "## Findings\n\nNo issues found.",
      title: "Review the entry point",
      suggestions: ["Show the relevant code"],
      files: [{ name: "index.ts", path: "src/index.ts" }],
    });

    expect(execute).toHaveBeenCalledWith({
      tool: "read_file",
      autoApprove: false,
      arguments: { path: "src/index.ts" },
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][0].format).toMatchObject({
      properties: { title: { type: "string" } },
    });
    expect(chat.mock.calls[1][0].format).toMatchObject({
      properties: { title: { type: "null" } },
    });
  });

  it("requires a title when retrying the first user message", async () => {
    const chat = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "final",
        response: "Retried answer",
        tool: null,
        autoApprove: false,
        arguments: {},
        title: "Retry the first question",
        suggestions: [],
        files: [],
      }),
    );
    const agent = new ChatAgent(
      createProvider(chat as GoodBuddyProvider["chat"]),
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      { list: () => [], execute: vi.fn() } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await expect(
      agent.run(
        [{ role: "user", content: "First question" }],
        { model: "qwen3:8b" } as unknown as ProviderModel,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      response: "Retried answer",
      title: "Retry the first question",
    });
    expect(chat.mock.calls[0][0].format).toMatchObject({
      properties: { title: { type: "string" } },
    });
  });

  it("asks the model to correct invalid JSON and returns its valid retry", async () => {
    const finalResponse = JSON.stringify({
      type: "final",
      response: "Recovered answer",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: "Answer me",
      suggestions: [],
      files: [],
    });
    const chat = vi
      .fn()
      .mockResolvedValueOnce("Here is my answer, outside the schema.")
      .mockResolvedValueOnce(finalResponse);
    const provider = createProvider(chat as GoodBuddyProvider["chat"]);
    const tools = {
      list: () => [],
      execute: vi.fn(),
    };
    const agent = new ChatAgent(
      provider,
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      tools as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await expect(
      agent.run(
        [{ role: "user", content: "Answer me" }],
        { model: "qwen3:8b" } as unknown as ProviderModel,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ response: "Recovered answer" });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1][0].messages.slice(-2)).toEqual([
      { role: "assistant", content: "Here is my answer, outside the schema." },
      {
        role: "system",
        content:
          "Your previous response could not be used: Response must be one valid JSON object. Follow the required response schema and return one complete JSON object only.",
      },
    ]);
  });

  it("requires null title when retrying a response after the first assistant response", async () => {
    const toolResponse = JSON.stringify({
      type: "tool_call",
      response: "",
      tool: "read_file",
      autoApprove: false,
      arguments: { path: "src/index.ts" },
      title: "Review the entry point",
      suggestions: [],
      files: [],
    });
    const invalidResponse = JSON.stringify({
      type: "final",
      response: "Answer",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: "Unexpected title",
      suggestions: [],
      files: [],
    });
    const validResponse = JSON.stringify({
      type: "final",
      response: "Recovered answer",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
      suggestions: [],
      files: [],
    });
    const chat = vi
      .fn()
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(validResponse);
    const agent = new ChatAgent(
      createProvider(chat as GoodBuddyProvider["chat"]),
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      {
        list: () => [{ id: "read_file" } as ToolDefinition],
        execute: vi.fn().mockResolvedValue("file contents"),
      } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await expect(
      agent.run(
        [{ role: "user", content: "Review the entry point" }],
        { model: "qwen3:8b" } as unknown as ProviderModel,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      response: "Recovered answer",
      title: "Review the entry point",
    });

    expect(chat).toHaveBeenCalledTimes(3);
    expect(chat.mock.calls[1][0].format).toMatchObject({
      properties: { title: { type: "null" } },
    });
    expect(chat.mock.calls[2][0].format).toMatchObject({
      properties: { title: { type: "null" } },
    });
  });

  it("retries provider-reported output-limit responses with a shorter answer request", async () => {
    const finalResponse = JSON.stringify({
      type: "final",
      response: "A complete concise answer.",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: "Answer me",
      suggestions: [],
      files: [],
    });
    const chatWithMetadata = vi
      .fn<GoodBuddyProvider["chatWithMetadata"]>()
      .mockResolvedValueOnce({
        content: '{"type":"final","response":"Partial answer',
        finishReason: "length",
      })
      .mockResolvedValueOnce({
        content: finalResponse,
        finishReason: "stop",
      });
    const provider = {
      ...createProvider(async () => ""),
      chatWithMetadata:
        chatWithMetadata as GoodBuddyProvider["chatWithMetadata"],
      chatStreamWithMetadata: async (
        options: ChatOptions,
        onChunk: (text: string) => void,
        signal?: AbortSignal,
      ) => {
        const result = await chatWithMetadata(options, signal);
        onChunk(result.content);
        return result;
      },
    };
    const agent = new ChatAgent(
      provider,
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      { list: () => [], execute: vi.fn() } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await expect(
      agent.run(
        [{ role: "user", content: "Answer me" }],
        { model: "qwen3:8b" } as unknown as ProviderModel,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ response: "A complete concise answer." });

    expect(chatWithMetadata).toHaveBeenCalledTimes(2);
    expect(
      chatWithMetadata.mock.calls[1][0].messages.at(-1)?.content,
    ).toContain(
      "The provider reached its output token limit.",
    );
    expect(
      chatWithMetadata.mock.calls[1][0].messages.some(
        ({ content }) => content === '{"type":"final","response":"Partial answer',
      ),
    ).toBe(false);
    expect(chatWithMetadata.mock.calls[1][0].format).toMatchObject({
      properties: { title: { type: "string" } },
    });
  });

  it("explains the output token limit when concise retries are still truncated", async () => {
    const chatWithMetadata = vi
      .fn<GoodBuddyProvider["chatWithMetadata"]>()
      .mockResolvedValue({
        content: '{"type":"final","response":"Partial answer',
        finishReason: "length",
      });
    const provider = {
      ...createProvider(async () => ""),
      chatWithMetadata:
        chatWithMetadata as GoodBuddyProvider["chatWithMetadata"],
      chatStreamWithMetadata: async (
        options: ChatOptions,
        onChunk: (text: string) => void,
        signal?: AbortSignal,
      ) => {
        const result = await chatWithMetadata(options, signal);
        onChunk(result.content);
        return result;
      },
    };
    const agent = new ChatAgent(
      provider,
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      { list: () => [], execute: vi.fn() } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await expect(
      agent.run(
        [{ role: "user", content: "List the files" }],
        { model: "qwen3:8b" } as unknown as ProviderModel,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      response: expect.stringContaining("output token limit"),
    });
    expect(chatWithMetadata).toHaveBeenCalledTimes(3);
    expect(
      chatWithMetadata.mock.calls[2][0].messages.filter(
        ({ role }) => role === "assistant",
      ),
    ).toEqual([]);
  });

  it("bounds large tool results before sending them back to the model", async () => {
    const toolResponse = JSON.stringify({
      type: "tool_call",
      response: "",
      tool: "read_file",
      autoApprove: false,
      arguments: { path: "large.txt" },
      title: "Summarize a file",
      suggestions: [],
      files: [],
    });
    const finalResponse = JSON.stringify({
      type: "final",
      response: "The file is large.",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
      suggestions: [],
      files: [],
    });
    const chat = vi.fn().mockResolvedValueOnce(toolResponse).mockResolvedValueOnce(finalResponse);
    const agent = new ChatAgent(
      createProvider(chat as GoodBuddyProvider["chat"]),
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      {
        list: () => [{ id: "read_file" } as ToolDefinition],
        execute: vi.fn().mockResolvedValue("x".repeat(7_000)),
      } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await agent.run(
      [{ role: "user", content: "Summarize the file" }],
      { model: "qwen3:8b" } as unknown as ProviderModel,
      new AbortController().signal,
    );

    expect(chat.mock.calls[1][0].messages.at(-1)?.content).toContain(
      "[Tool result truncated to 6000 characters.]",
    );
    expect(chat.mock.calls[1][0].messages.at(-1)?.content).not.toContain(
      "x".repeat(6_001),
    );
  });

  it("stops after the bounded number of invalid response retries", async () => {
    const chat = vi.fn().mockResolvedValue("not JSON");
    const agent = new ChatAgent(
      createProvider(chat as GoodBuddyProvider["chat"]),
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project context") } as never,
      { list: () => [], execute: vi.fn() } as never,
      {
        onToolStatus: vi.fn(),
        onModelStatus: vi.fn(),
      },
    );

    await expect(
      agent.run(
        [{ role: "user", content: "Answer me" }],
        { model: "qwen3:8b" } as unknown as ProviderModel,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      response:
        "I couldn't get a valid response after asking the model to correct its format. Please try again.",
    });
    expect(chat).toHaveBeenCalledTimes(3);
  });
});
