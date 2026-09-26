import { describe, expect, it, vi } from "vitest";
import type { GoodBuddyProvider } from "@/provider";
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
        "qwen3:8b",
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
  });
});
