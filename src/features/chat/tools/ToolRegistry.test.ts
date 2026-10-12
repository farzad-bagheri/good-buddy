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
