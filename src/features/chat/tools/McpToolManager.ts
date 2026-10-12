import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  CallToolResultSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type * as vscode from "vscode";
import type { ToolCall, ToolDefinition } from "../types";
import { ToolRegistry } from "./ToolRegistry";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface McpConnection {
  listTools(): Promise<Tool[]>;
  callTool(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<McpCallResult>;
  close(): Promise<void>;
}

interface McpConnectionEvents {
  onClose(): void;
  onError(error: Error): void;
  onToolsChanged(error: Error | null, tools: Tool[] | null): void;
}

interface McpCallResult {
  content: CallToolResult["content"];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type McpConnector = (
  name: string,
  config: McpServerConfig,
  log: (message: string) => void,
  extensionVersion: string,
  events: McpConnectionEvents,
) => Promise<McpConnection>;
type ConfirmToolCall = (
  server: string,
  tool: Tool,
  arguments_: Record<string, unknown>,
) => Promise<boolean>;

interface ConnectedServer {
  connection: McpConnection;
  toolIds: string[];
  active: boolean;
  refreshing: boolean;
  pendingTools?: Tool[] | null;
}

const MAX_TOOL_RESULT_LENGTH = 12_000;

export class McpToolManager implements vscode.Disposable {
  private readonly servers = new Map<string, ConnectedServer>();
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly output: Pick<vscode.OutputChannel, "appendLine">,
    private readonly confirmToolCall: ConfirmToolCall,
    private readonly connect: McpConnector = connectStdioServer,
    private readonly extensionVersion = "0.0.0",
  ) {}

  async configure(value: unknown): Promise<void> {
    const generation = ++this.generation;
    await this.disconnectAll();
    if (this.disposed || generation !== this.generation) return;

    for (const [name, config] of parseServerConfigs(value, this.output)) {
      let connection: McpConnection | undefined;
      let connected: ConnectedServer | undefined;
      let closedBeforeRegistration = false;
      let pendingTools: Tool[] | null | undefined;
      try {
        connection = await this.connect(
          name,
          resolveServerEnvironment(config),
          (message) => this.output.appendLine(`[MCP:${name}] ${message}`),
          this.extensionVersion,
          {
            onClose: () => {
              if (connected) this.handleServerClose(name, connected);
              else closedBeforeRegistration = true;
            },
            onError: (error) =>
              this.output.appendLine(
                `[MCP:${name}] Transport error: ${formatError(error)}`,
              ),
            onToolsChanged: (error, tools) => {
              if (error) {
                this.output.appendLine(
                  `[MCP:${name}] Tool list notification failed: ${formatError(error)}`,
                );
                return;
              }
              if (connected) {
                void this.refreshTools(name, connected, tools);
              } else {
                pendingTools = tools;
              }
            },
          },
        );
        if (this.disposed || generation !== this.generation || closedBeforeRegistration) {
          await connection.close();
          if (closedBeforeRegistration) {
            this.output.appendLine(
              `[MCP:${name}] Server exited during connection setup.`,
            );
          }
          return;
        }

        const tools = pendingTools ?? (await connection.listTools());
        if (
          this.disposed ||
          generation !== this.generation ||
          closedBeforeRegistration
        ) {
          await connection.close();
          if (closedBeforeRegistration) {
            this.output.appendLine(
              `[MCP:${name}] Server exited while discovering its tools.`,
            );
          }
          return;
        }
        connected = {
          connection,
          toolIds: [],
          active: true,
          refreshing: false,
        };
        this.servers.set(name, connected);
        this.registerTools(name, connected, tools);
        this.output.appendLine(
          `[MCP:${name}] Connected; registered ${connected.toolIds.length} tool(s).`,
        );
        if (pendingTools !== undefined && pendingTools !== tools) {
          void this.refreshTools(name, connected, pendingTools);
        }
      } catch (error) {
        if (connection && (!connected || !connected.active)) {
          try {
            await connection.close();
          } catch (closeError) {
            this.output.appendLine(
              `[MCP:${name}] Cleanup after connection failure also failed: ${formatError(closeError)}`,
            );
          }
        }
        this.output.appendLine(
          `[MCP:${name}] Connection failed: ${formatError(error)}`,
        );
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    void this.disconnectAll();
  }

  private async executeTool(
    serverName: string,
    tool: Tool,
    connection: McpConnection,
    call: ToolCall,
  ): Promise<string> {
    if (!this.isConnectionActive(serverName, connection)) {
      throw new Error(`MCP server "${serverName}" is disconnected.`);
    }
    if (!(await this.confirmToolCall(serverName, tool, call.arguments))) {
      throw new Error("MCP tool call was not approved by the user.");
    }
    if (!this.isConnectionActive(serverName, connection)) {
      throw new Error(
        `MCP server "${serverName}" disconnected before the tool could run.`,
      );
    }

    let result: McpCallResult;
    try {
      result = await connection.callTool(tool.name, call.arguments);
    } catch (error) {
      if (!this.isConnectionActive(serverName, connection)) {
        throw new Error(
          `MCP server "${serverName}" disconnected while running "${tool.name}".`,
          { cause: error },
        );
      }
      throw new Error(
        `MCP tool "${tool.name}" on server "${serverName}" failed: ${formatError(error)}`,
        { cause: error },
      );
    }
    const content = result.structuredContent
      ? JSON.stringify(result.structuredContent)
      : result.content
          .map((item) => formatContentItem(item))
          .filter(Boolean)
          .join("\n");
    const response = result.isError
      ? `MCP tool reported an error:\n${content}`
      : content || "The MCP tool returned no content.";
    return truncate(response, MAX_TOOL_RESULT_LENGTH);
  }

  private async disconnectAll(): Promise<void> {
    const connectedServers = [...this.servers.entries()];
    this.servers.clear();
    for (const [name, server] of connectedServers) {
      server.active = false;
      this.unregisterTools(server);
      try {
        await server.connection.close();
        this.output.appendLine(`[MCP:${name}] Disconnected.`);
      } catch (error) {
        this.output.appendLine(
          `[MCP:${name}] Disconnect failed: ${formatError(error)}`,
        );
      }
    }
  }

  private handleServerClose(name: string, server: ConnectedServer): void {
    if (this.servers.get(name) !== server || !server.active) return;
    server.active = false;
    this.servers.delete(name);
    this.unregisterTools(server);
    this.output.appendLine(
      `[MCP:${name}] Server disconnected unexpectedly; removed its registered tools. Update goodBuddy.mcpServers to reconnect.`,
    );
  }

  private async refreshTools(
    name: string,
    server: ConnectedServer,
    announcedTools: Tool[] | null,
  ): Promise<void> {
    if (!server.active || this.servers.get(name) !== server) return;
    if (server.refreshing) {
      server.pendingTools = announcedTools;
      return;
    }
    server.refreshing = true;
    try {
      let toolsToRegister: Tool[] | null = announcedTools;
      while (true) {
        const tools =
          toolsToRegister ?? (await server.connection.listTools());
        if (!server.active || this.servers.get(name) !== server) return;
        this.unregisterTools(server);
        this.registerTools(name, server, tools);
        this.output.appendLine(
          `[MCP:${name}] Refreshed tool list; ${server.toolIds.length} tool(s) available.`,
        );
        const hasPendingTools = server.pendingTools !== undefined;
        toolsToRegister = server.pendingTools ?? null;
        server.pendingTools = undefined;
        if (!hasPendingTools) break;
      }
    } catch (error) {
      this.output.appendLine(
        `[MCP:${name}] Could not refresh tools: ${formatError(error)}`,
      );
    } finally {
      server.refreshing = false;
    }
  }

  private registerTools(
    name: string,
    server: ConnectedServer,
    tools: Tool[],
  ): void {
    const seenIds = new Set<string>();
    for (const tool of tools) {
      const id = mcpToolId(name, tool.name);
      if (seenIds.has(id)) {
        this.output.appendLine(
          `[MCP:${name}] Ignored duplicate tool name "${tool.name}".`,
        );
        continue;
      }
      seenIds.add(id);
      const definition: ToolDefinition = {
        id,
        description: tool.description || `MCP tool ${tool.name}`,
        inputSchema: tool.inputSchema,
        execute: (call) =>
          this.executeTool(name, tool, server.connection, call),
      };
      try {
        this.registry.register(definition);
        server.toolIds.push(id);
      } catch (error) {
        this.output.appendLine(
          `[MCP:${name}] Could not register tool ${tool.name}: ${formatError(error)}`,
        );
      }
    }
  }

  private unregisterTools(server: ConnectedServer): void {
    for (const id of server.toolIds) this.registry.unregister(id);
    server.toolIds = [];
  }

  private isConnectionActive(
    name: string,
    connection: McpConnection,
  ): boolean {
    const server = this.servers.get(name);
    return server?.connection === connection && server.active;
  }
}

function parseServerConfigs(
  value: unknown,
  output: Pick<vscode.OutputChannel, "appendLine">,
): Array<[string, McpServerConfig]> {
  if (!isRecord(value)) {
    if (value !== undefined && value !== null) {
      output.appendLine("[MCP] goodBuddy.mcpServers must be an object.");
    }
    return [];
  }

  const servers: Array<[string, McpServerConfig]> = [];
  for (const [name, serverValue] of Object.entries(value)) {
    if (
      !isRecord(serverValue) ||
      typeof serverValue.command !== "string" ||
      !serverValue.command.trim()
    ) {
      output.appendLine(
        `[MCP:${name}] Invalid server configuration: command must be a non-empty string.`,
      );
      continue;
    }
    if (
      (serverValue.args !== undefined &&
        !isStringArray(serverValue.args)) ||
      (serverValue.env !== undefined &&
        !isStringRecord(serverValue.env)) ||
      (serverValue.cwd !== undefined && typeof serverValue.cwd !== "string")
    ) {
      output.appendLine(
        `[MCP:${name}] Invalid server configuration: args, env, or cwd has an invalid value.`,
      );
      continue;
    }
    servers.push([
      name,
      {
        command: serverValue.command,
        args: serverValue.args,
        env: serverValue.env,
        cwd: serverValue.cwd,
      },
    ]);
  }
  return servers;
}

async function connectStdioServer(
  name: string,
  config: McpServerConfig,
  log: (message: string) => void,
  extensionVersion: string,
  events: McpConnectionEvents,
): Promise<McpConnection> {
  const client = new Client(
    {
      name: `good-buddy-${name}`,
      version: extensionVersion,
    },
    {
      capabilities: {},
      listChanged: {
        tools: {
          onChanged: (error, tools) => events.onToolsChanged(error, tools),
        },
      },
    },
  );
  client.onclose = events.onClose;
  client.onerror = events.onError;
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text) log(`[server stderr] ${text}`);
  });

  try {
    await client.connect(transport);
  } catch (error) {
    try {
      await client.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "MCP server connection and cleanup both failed.",
        { cause: closeError },
      );
    }
    throw error;
  }

  return {
    listTools: async () => (await client.listTools()).tools,
    callTool: (toolName, arguments_) =>
      callStandardTool(client, toolName, arguments_),
    close: () => client.close(),
  };
}

async function callStandardTool(
  client: Client,
  name: string,
  arguments_: Record<string, unknown>,
): Promise<McpCallResult> {
  const result = await client.callTool({ name, arguments: arguments_ });
  if (!("content" in result)) {
    throw new Error("Task-based MCP tool responses are not supported yet.");
  }
  const standardResult = CallToolResultSchema.parse(result);
  return {
    content: standardResult.content,
    structuredContent: standardResult.structuredContent,
    isError: standardResult.isError,
  };
}

function mcpToolId(server: string, tool: string): string {
  return `mcp:${encodeURIComponent(server)}:${encodeURIComponent(tool)}`;
}

function formatContentItem(item: CallToolResult["content"][number]): string {
  if (item.type === "text") return item.text;
  if (item.type === "image") return `[Image result omitted: ${item.mimeType}]`;
  if (item.type === "audio") return `[Audio result omitted: ${item.mimeType}]`;
  if (item.type === "resource") {
    return "text" in item.resource
      ? item.resource.text
      : `[Binary resource omitted: ${item.resource.mimeType ?? "unknown type"}]`;
  }
  return JSON.stringify(item);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function resolveServerEnvironment(
  config: McpServerConfig,
): McpServerConfig {
  if (!config.env) return config;
  const env = Object.fromEntries(
    Object.entries(config.env).map(([key, value]) => [
      key,
      value.replace(/\$\{env:([^}]+)\}/g, (_match, variable: string) => {
        const resolved = process.env[variable];
        if (resolved === undefined) {
          throw new Error(
            `MCP server environment variable '${variable}' is not set.`,
          );
        }
        return resolved;
      }),
    ]),
  );
  return { ...config, env };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, limit: number): string {
  return value.length > limit
    ? `${value.slice(0, limit)}\n[Result truncated at ${limit} characters.]`
    : value;
}
