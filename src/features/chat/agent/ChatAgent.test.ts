import { describe, expect, it, vi } from "vitest";
import type { GoodBuddyProvider, ProviderModel } from "@/provider";
import type { ToolDefinition } from "../types";
import { ChatAgent } from "./ChatAgent";

describe("ChatAgent", () => {
  it("executes structured tool calls and returns the final Markdown and title", async () => {
    const toolResponse = JSON.stringify({
      type: "tool_call",
      response: "",
      tool: "read_file",
      autoApprove: false,
      arguments: { path: "src/index.ts" },
      title: "Review the entry point",
    });
    const finalResponse = JSON.stringify({
      type: "final",
      response: "## Findings\n\nNo issues found.",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
    });
    const chat = vi
      .fn()
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(finalResponse);
    const provider = { chat } as unknown as GoodBuddyProvider;
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
      properties: { title: { type: ["string", "null"] } },
    });
  });

  it("asks the model to correct invalid JSON and returns its valid retry", async () => {
    const finalResponse = JSON.stringify({
      type: "final",
      response: "Recovered answer",
      tool: null,
      autoApprove: false,
      arguments: {},
      title: null,
    });
    const chat = vi
      .fn()
      .mockResolvedValueOnce("Here is my answer, outside the schema.")
      .mockResolvedValueOnce(finalResponse);
    const provider = { chat } as unknown as GoodBuddyProvider;
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
        role: "user",
        content:
          "Your previous response did not follow the required JSON response format: Response must be one valid JSON object. Return one corrected JSON object only.",
      },
    ]);
  });

  it("stops after the bounded number of invalid response retries", async () => {
    const chat = vi.fn().mockResolvedValue("not JSON");
    const agent = new ChatAgent(
      { chat } as unknown as GoodBuddyProvider,
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
