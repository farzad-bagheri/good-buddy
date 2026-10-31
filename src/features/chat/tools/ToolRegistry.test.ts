import { describe, expect, it, vi } from "vitest";
import type { ToolCall, ToolDefinition } from "../types";
import { ToolRegistry } from "./ToolRegistry";

function createTool(id: string): ToolDefinition {
  return {
    id,
    description: `Tool ${id}`,
    execute: vi.fn(async () => `result from ${id}`),
  };
}

describe("ToolRegistry", () => {
  it("registers and executes tools with dynamic identifiers", async () => {
    const registry = new ToolRegistry([]);
    const tool = createTool("mcp__docs__search");
    const call: ToolCall = {
      tool: tool.id,
      autoApprove: false,
      arguments: { query: "MCP" },
    };
    registry.register(tool);

    await expect(registry.execute(call)).resolves.toBe(
      "result from mcp__docs__search",
    );
    expect(tool.execute).toHaveBeenCalledWith(call);
    expect(registry.list()).toEqual([tool]);
  });

  it("rejects duplicate identifiers rather than replacing registered tools", () => {
    const registry = new ToolRegistry([createTool("read_file")]);

    expect(() => registry.register(createTool("read_file"))).toThrow(
      "Tool already registered: read_file",
    );
    expect(registry.list()).toHaveLength(1);
  });

  it("validates required and unsupported arguments for tools with schemas", async () => {
    const tool = {
      ...createTool("read_file"),
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    };
    const registry = new ToolRegistry([tool]);

    await expect(
      registry.execute({ tool: "read_file", autoApprove: false, arguments: {} }),
    ).rejects.toThrow("Tool argument 'path' is required.");
    await expect(
      registry.execute({
        tool: "read_file",
        autoApprove: false,
        arguments: { path: "notes.txt", extra: true },
      }),
    ).rejects.toThrow("Tool argument 'extra' is not supported.");
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("unregisters tools when an external provider disconnects", () => {
    const tool = createTool("mcp__docs__search");
    const registry = new ToolRegistry([tool]);

    expect(registry.unregister(tool.id)).toBe(true);
    expect(registry.unregister(tool.id)).toBe(false);
    expect(registry.list()).toEqual([]);
    expect(() =>
      registry.get(tool.id),
    ).toThrow(`Unknown tool: ${tool.id}`);
  });
});
