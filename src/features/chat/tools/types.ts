import { ToolCall, ToolName } from "../types";

export interface ToolDefinition {
  id: ToolName;
  description: string;
  execute(call: ToolCall): Promise<string>;
}

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
