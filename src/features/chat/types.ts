export type ToolName =
  | "list_project"
  | "search_files"
  | "search_file_contents"
  | "read_file"
  | "get_diagnostics"
  | "find_references"
  | "write_file"
  | "replace_in_file"
  | "delete_file"
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
