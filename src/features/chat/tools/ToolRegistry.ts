import type { ToolCall, ToolDefinition } from "../types";

/**
 * Manages the registration and execution of chat tools.
 */
export class ToolRegistry {
  private readonly toolsById = new Map<string, ToolDefinition>();

  constructor(tools: readonly ToolDefinition[]) {
    for (const tool of tools) this.register(tool);
  }

  list(): readonly ToolDefinition[] {
    return [...this.toolsById.values()];
  }

  get(id: string): ToolDefinition {
    const tool = this.toolsById.get(id);
    if (!tool) throw new Error(`Unknown tool: ${id}`);
    return tool;
  }

  register(tool: ToolDefinition): void {
    if (this.toolsById.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.toolsById.set(tool.id, tool);
  }

  unregister(id: string): boolean {
    return this.toolsById.delete(id);
  }

  /**
   * Executes the specified tool call by retrieving the corresponding tool and invoking its execute function.
   * @param call The tool call containing the tool ID and arguments.
   * @returns The result of executing the tool as a string.
   * @throws An error if the tool ID is unknown.
   */
  async execute(call: ToolCall): Promise<string> {
    return this.get(call.tool).execute(call);
  }
}
