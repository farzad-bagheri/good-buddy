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
    const tool = this.get(call.tool);
    // MCP tools own their confirmation and argument validation lifecycle.
    // Validate built-ins before execution, but do not bypass MCP confirmation.
    if (!call.tool.startsWith("mcp:")) {
      validateArguments(tool.inputSchema, call.arguments);
    }
    return tool.execute(call);
  }
}

function validateArguments(
  schema: ToolDefinition["inputSchema"],
  arguments_: Record<string, unknown>,
): void {
  if (!schema || schema.type !== "object") return;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const name of required) {
    if (typeof name === "string" && !(name in arguments_)) {
      throw new Error(`Tool argument '${name}' is required.`);
    }
  }
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(arguments_)) {
      if (!(name in properties)) {
        throw new Error(`Tool argument '${name}' is not supported.`);
      }
    }
  }
  for (const [name, value] of Object.entries(arguments_)) {
    const property = properties[name];
    if (!isRecord(property)) continue;
    if (property.type === "string" && typeof value !== "string") {
      throw new Error(`Tool argument '${name}' must be a string.`);
    }
    if (property.type === "number" && typeof value !== "number") {
      throw new Error(`Tool argument '${name}' must be a number.`);
    }
    if (property.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Tool argument '${name}' must be a boolean.`);
    }
    if (Array.isArray(property.enum) && !property.enum.includes(value)) {
      throw new Error(`Tool argument '${name}' must use a supported value.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
