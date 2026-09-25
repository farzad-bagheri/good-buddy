import type { ToolCall, ToolDefinition, ToolName } from "../types";

/**
 * Manages the registration and execution of chat tools within the Good Buddy chat application.
 */
export class ToolRegistry {
  private readonly toolsById: ReadonlyMap<ToolName, ToolDefinition>;

  constructor(tools: readonly ToolDefinition[]) {
    this.toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  }

  list(): readonly ToolDefinition[] {
    return [...this.toolsById.values()];
  }

  get(id: ToolName): ToolDefinition {
    const tool = this.toolsById.get(id);
    if (!tool) throw new Error(`Unknown tool: ${id}`);
    return tool;
  }

  async execute(call: ToolCall): Promise<string> {
    return this.get(call.tool).execute(call);
  }
}
