export type ToolName =
  | "list_project"
  | "read_file"
  | "write_file"
  | "replace_in_file"
  | "run_command";

export interface ToolCall {
  tool: ToolName;
  autoApprove: boolean;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  id: ToolName;
  description: string;
  execute(call: ToolCall): Promise<string>;
}

