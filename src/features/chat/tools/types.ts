import { ToolCall, ToolName } from "../types";

export interface ToolDefinition {
  id: ToolName;
  description: string;
  execute(call: ToolCall): Promise<string>;
}

