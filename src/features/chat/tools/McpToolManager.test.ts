import { describe, expect, it, vi } from "vitest";
import { execPath } from "node:process";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCall } from "../types";
import { ToolRegistry } from "./ToolRegistry";
import { McpToolManager } from "./McpToolManager";

const lookupTool: Tool = {
  name: "lookup",
  description: "Look up a document",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

function createConnection() {
  return {
    listTools: vi.fn(async () => [lookupTool]),
    callTool: vi.fn(async () => ({
      content: [{ type: "text" as const, text: "Document found" }],
    })),
    close: vi.fn(async () => {}),
  };
}

describe("McpToolManager", () => {
  it("registers namespaced MCP tools and confirms each call before execution", async () => {
    const connection = createConnection();
    const confirm = vi.fn(async () => true);
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      { appendLine: vi.fn() },
      confirm,
      async () => connection,
    );
    const call: ToolCall = {
      tool: "mcp:docs:lookup",
      autoApprove: false,
      arguments: { query: "MCP" },
    };
    await manager.configure({
      docs: { command: "node", args: ["server.js"] },
    });

    await expect(registry.execute(call)).resolves.toBe("Document found");
    expect(confirm).toHaveBeenCalledWith("docs", lookupTool, {
      query: "MCP",
    });
    expect(connection.callTool).toHaveBeenCalledWith("lookup", {
      query: "MCP",
    });

    await manager.configure({});
    expect(connection.close).toHaveBeenCalledOnce();
    expect(registry.list()).toEqual([]);
  });

  it("does not call an MCP tool when confirmation is rejected", async () => {
    const connection = createConnection();
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      { appendLine: vi.fn() },
      async () => false,
      async () => connection,
    );
    await manager.configure({ docs: { command: "node" } });

    await expect(
      registry.execute({
        tool: "mcp:docs:lookup",
        autoApprove: true,
        arguments: {},
      }),
    ).rejects.toThrow("MCP tool call was not approved by the user.");
    expect(connection.callTool).not.toHaveBeenCalled();
  });

  it("reports invalid configuration and leaves the registry unchanged", async () => {
    const output = { appendLine: vi.fn() };
    const connect = vi.fn();
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      output,
      async () => true,
      connect,
    );

    await manager.configure({ broken: { args: ["server.js"] } });

    expect(connect).not.toHaveBeenCalled();
    expect(registry.list()).toEqual([]);
    expect(output.appendLine).toHaveBeenCalledWith(
      "[MCP:broken] Invalid server configuration: command must be a non-empty string.",
    );
  });

  it("removes tools and reports when a server exits unexpectedly", async () => {
    const connection = createConnection();
    let onClose: (() => void) | undefined;
    const output = { appendLine: vi.fn() };
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      output,
      async () => true,
      async (_name, _config, _log, _version, events) => {
        onClose = events.onClose;
        return connection;
      },
    );
    await manager.configure({ docs: { command: "node" } });

    onClose?.();

    expect(registry.list()).toEqual([]);
    expect(output.appendLine).toHaveBeenCalledWith(
      '[MCP:docs] Server disconnected unexpectedly; removed its registered tools. Update goodBuddy.mcpServers to reconnect.',
    );
    await expect(
      registry.execute({
        tool: "mcp:docs:lookup",
        autoApprove: false,
        arguments: {},
      }),
    ).rejects.toThrow("Unknown tool: mcp:docs:lookup");
  });

  it("reports an in-flight tool call failure if its server disconnects", async () => {
    const connection = createConnection();
    let onClose: (() => void) | undefined;
    let failCall: (() => void) | undefined;
    connection.callTool.mockImplementationOnce(
      async () =>
        new Promise((_, reject) => {
          failCall = () => reject(new Error("transport closed"));
        }),
    );
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      { appendLine: vi.fn() },
      async () => true,
      async (_name, _config, _log, _version, events) => {
        onClose = events.onClose;
        return connection;
      },
    );
    await manager.configure({ docs: { command: "node" } });
    const execution = registry.execute({
      tool: "mcp:docs:lookup",
      autoApprove: false,
      arguments: {},
    });
    await vi.waitFor(() => expect(failCall).toBeTypeOf("function"));
    onClose?.();
    failCall?.();

    await expect(execution).rejects.toThrow(
      'MCP server "docs" disconnected while running "lookup".',
    );
  });

  it("refreshes registered tools when the server list changes", async () => {
    const connection = createConnection();
    let onToolsChanged:
      | ((error: Error | null, tools: Tool[] | null) => void)
      | undefined;
    const output = { appendLine: vi.fn() };
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      output,
      async () => true,
      async (_name, _config, _log, _version, events) => {
        onToolsChanged = events.onToolsChanged;
        return connection;
      },
    );
    await manager.configure({ docs: { command: "node" } });

    onToolsChanged?.(null, [
      {
        name: "search",
        description: "Search documents",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      },
    ]);

    await vi.waitFor(() => {
      expect(registry.list().map(({ id }) => id)).toEqual([
        "mcp:docs:search",
      ]);
    });
    expect(output.appendLine).toHaveBeenCalledWith(
      "[MCP:docs] Refreshed tool list; 1 tool(s) available.",
    );
  });

  it("reconnects after server configuration changes", async () => {
    const connections = [createConnection(), createConnection()];
    const connect = vi
      .fn()
      .mockImplementationOnce(async () => connections[0])
      .mockImplementationOnce(async () => connections[1]);
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      { appendLine: vi.fn() },
      async () => true,
      connect,
    );

    await manager.configure({ docs: { command: "node", args: ["old.js"] } });
    await manager.configure({ docs: { command: "node", args: ["new.js"] } });

    expect(connections[0].close).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(registry.list().map(({ id }) => id)).toEqual(["mcp:docs:lookup"]);
    await manager.configure({});
  });

  it("resolves configured environment variable references before connecting", async () => {
    const variable = "GOOD_BUDDY_TEST_MCP_TOKEN";
    vi.stubEnv(variable, "test-token");
    const connection = createConnection();
    const connect = vi.fn(async () => connection);
    const manager = new McpToolManager(
      new ToolRegistry([]),
      { appendLine: vi.fn() },
      async () => true,
      connect,
    );

    try {
      await manager.configure({
        docs: {
          command: "node",
          env: { API_TOKEN: `\${env:${variable}}` },
        },
      });
      expect(connect).toHaveBeenCalledWith(
        "docs",
        expect.objectContaining({ env: { API_TOKEN: "test-token" } }),
        expect.any(Function),
        "0.0.0",
        expect.objectContaining({
          onClose: expect.any(Function),
          onError: expect.any(Function),
          onToolsChanged: expect.any(Function),
        }),
      );
    } finally {
      await manager.configure({});
      vi.unstubAllEnvs();
    }
  });

  it("connects to a real local stdio MCP server", async () => {
    const serverScript = `
      import { Server } from "@modelcontextprotocol/sdk/server/index.js";
      import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
      import {
        CallToolRequestSchema,
        ListToolsRequestSchema,
      } from "@modelcontextprotocol/sdk/types.js";

      const server = new Server(
        { name: "good-buddy-test-server", version: "1.0.0" },
        { capabilities: { tools: { listChanged: true } } },
      );
      let tools = [{
        name: "echo",
        description: "Return the provided text",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      }];
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools,
      }));
      server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
        if (params.name === "echo") {
          tools = [
            ...tools,
            {
              name: "later",
              description: "A tool added while connected",
              inputSchema: { type: "object", properties: {} },
            },
          ];
          await server.sendToolListChanged();
        }
        return {
          content: [{
            type: "text",
            text: String(params.arguments?.text ?? ""),
          }],
        };
      });
      await server.connect(new StdioServerTransport());
    `;
    const registry = new ToolRegistry([]);
    const manager = new McpToolManager(
      registry,
      { appendLine: vi.fn() },
      async () => true,
    );

    try {
      await manager.configure({
        local: {
          command: execPath,
          args: ["--input-type=module", "-e", serverScript],
        },
      });
      await expect(
        registry.execute({
          tool: "mcp:local:echo",
          autoApprove: false,
          arguments: { text: "stdio works" },
        }),
      ).resolves.toBe("stdio works");
      await vi.waitFor(() => {
        expect(registry.list().map(({ id }) => id)).toContain(
          "mcp:local:later",
        );
      });
    } finally {
      await manager.configure({});
    }
  }, 15_000);
});
