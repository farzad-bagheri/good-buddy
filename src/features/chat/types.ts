export interface ToolCall {
  tool: string;
  autoApprove: boolean;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  /** Unique identifier used in assistant responses (for MCP, namespace by server). */
  id: string;
  description: string;
  /** JSON Schema describing the arguments accepted by this tool. */
  inputSchema?: Record<string, unknown>;
  execute(call: ToolCall): Promise<string>;
}
