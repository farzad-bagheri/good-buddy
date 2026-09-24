export type ToolName = "list_project" | "read_file" | "write_file" | "replace_in_file" | "run_command";

export interface ToolCall {
  tool: ToolName;
  arguments: Record<string, unknown>;
}

export interface WriteProposal {
  path: string;
  diff: string;
}
