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
