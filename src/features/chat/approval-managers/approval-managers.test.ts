import { describe, expect, it, vi } from "vitest";
import { CommandApprovalManager } from "./CommandApprovalManager";
import { WriteApprovalManager } from "./WriteApprovalManager";
import type { WorkspaceTools } from "../tools";
import type { ToolCall } from "../types";

describe("approval managers", () => {
  it("requires review even when a model marks a write auto-approved", async () => {
    const applyWrite = vi.fn().mockResolvedValue("Wrote notes.txt.");
    const propose = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentSnapshot: vi.fn().mockResolvedValue({
          content: "before",
          exists: true,
          root: "D:\\workspace",
        }),
        proposeWrite: vi.fn().mockResolvedValue({
          path: "notes.txt",
          diff: "diff",
        }),
        applyWrite,
      } as unknown as WorkspaceTools,
      { propose, complete: vi.fn() },
    );
    const toolCall: ToolCall = {
      tool: "write_file",
      autoApprove: true,
      arguments: { path: "notes.txt", content: "after" },
    };

    const pending = manager.executeOrPropose(toolCall);
    await vi.waitFor(() => expect(propose).toHaveBeenCalledOnce());
    expect(applyWrite).not.toHaveBeenCalled();
    await manager.review("1", true);
    await expect(pending).resolves.toBe("Wrote notes.txt.");
    expect(applyWrite).toHaveBeenCalledWith(
      "notes.txt",
      "before",
      "after",
      true,
      "D:\\workspace",
    );
  });

  it("still requires review for writes not marked auto-approved", async () => {
    const applyWrite = vi.fn().mockResolvedValue("Wrote notes.txt.");
    const propose = vi.fn();
    const complete = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentSnapshot: vi.fn().mockResolvedValue({
          content: "before",
          exists: true,
          root: "D:\\workspace",
        }),
        proposeWrite: vi.fn().mockResolvedValue({
          path: "notes.txt",
          diff: "diff",
        }),
        applyWrite,
      } as unknown as WorkspaceTools,
      { propose, complete },
    );
    const pending = manager.executeOrPropose({
      tool: "write_file",
      autoApprove: false,
      arguments: { path: "notes.txt", content: "after" },
    });

    await vi.waitFor(() => expect(propose).toHaveBeenCalledOnce());
    expect(propose).toHaveBeenCalledWith(
      "1",
      "notes.txt",
      "diff",
      "before",
      "after",
      true,
    );
    expect(applyWrite).not.toHaveBeenCalled();
    await manager.review("1", true);
    await expect(pending).resolves.toBe("Wrote notes.txt.");
    expect(complete).toHaveBeenCalledWith("1", "Wrote notes.txt.");
  });

  it("accepts contents as a fallback for the write_file content argument", async () => {
    const applyWrite = vi.fn().mockResolvedValue("Wrote pom.xml.");
    const propose = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentSnapshot: vi.fn().mockResolvedValue({
          content: "",
          exists: false,
          root: "D:\\workspace",
        }),
        proposeWrite: vi.fn().mockResolvedValue({
          path: "pom.xml",
          diff: "diff",
        }),
        applyWrite,
      } as unknown as WorkspaceTools,
      { propose, complete: vi.fn() },
    );
    const pending = manager.executeOrPropose({
      tool: "write_file",
      autoApprove: false,
      arguments: { path: "pom.xml", contents: "<project/>" },
    });

    await vi.waitFor(() => expect(propose).toHaveBeenCalledOnce());
    expect(propose).toHaveBeenCalledWith(
      "1",
      "pom.xml",
      "diff",
      "",
      "<project/>",
      false,
    );
    await manager.review("1", true);
    await expect(pending).resolves.toBe("Wrote pom.xml.");
    expect(applyWrite).toHaveBeenCalledWith(
      "pom.xml",
      "",
      "<project/>",
      false,
      "D:\\workspace",
    );
  });

  it("allows an approved write_file operation with empty content", async () => {
    const applyWrite = vi.fn().mockResolvedValue("Wrote empty.txt.");
    const propose = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentSnapshot: vi.fn().mockResolvedValue({
          content: "before",
          exists: true,
          root: "D:\\workspace",
        }),
        proposeWrite: vi.fn().mockResolvedValue({
          path: "empty.txt",
          diff: "diff",
        }),
        applyWrite,
      } as unknown as WorkspaceTools,
      { propose, complete: vi.fn() },
    );
    const pending = manager.executeOrPropose({
      tool: "write_file",
      autoApprove: false,
      arguments: { path: "empty.txt", content: "" },
    });

    await vi.waitFor(() => expect(propose).toHaveBeenCalledOnce());
    await manager.review("1", true);
    await expect(pending).resolves.toBe("Wrote empty.txt.");
    expect(applyWrite).toHaveBeenCalledWith(
      "empty.txt",
      "before",
      "",
      true,
      "D:\\workspace",
    );
  });

  it("reports pending writes cancelled when the active turn is abandoned", async () => {
    const complete = vi.fn();
    const propose = vi.fn();
    const applyWrite = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentSnapshot: vi.fn().mockResolvedValue({
          content: "before",
          exists: true,
          root: "D:\\workspace",
        }),
        proposeWrite: vi.fn().mockResolvedValue({
          path: "notes.txt",
          diff: "diff",
        }),
        applyWrite,
      } as unknown as WorkspaceTools,
      { propose, complete },
    );
    const pending = manager.executeOrPropose({
      tool: "write_file",
      autoApprove: false,
      arguments: { path: "notes.txt", content: "after" },
    });

    await vi.waitFor(() => expect(propose).toHaveBeenCalledOnce());
    manager.rejectAll("Write cancelled because a new chat request was sent.");

    await expect(pending).resolves.toBe(
      "Write cancelled because a new chat request was sent.",
    );
    expect(complete).toHaveBeenCalledWith(
      "1",
      "Write cancelled because a new chat request was sent.",
    );
    expect(applyWrite).not.toHaveBeenCalled();
  });

  it("requires review even when a model marks a command auto-approved", async () => {
    const runCommand = vi.fn(
      async (_command: string, onOutput?: (chunk: string) => void) => {
        onOutput?.("command output");
        return "done";
      },
    );
    const propose = vi.fn();
    const start = vi.fn();
    const output = vi.fn();
    const complete = vi.fn();
    const manager = new CommandApprovalManager(
      {
        runCommand,
        currentWorkspaceRoot: vi.fn().mockReturnValue("D:\\workspace"),
      } as unknown as WorkspaceTools,
      { propose, start, output, complete },
    );

    const pending = manager.executeOrPropose({
      tool: "run_command",
      autoApprove: true,
      arguments: { command: "pnpm test" },
    });
    expect(propose).toHaveBeenCalledWith("1", "pnpm test");
    expect(runCommand).not.toHaveBeenCalled();
    await manager.executeOrReject("1", true);
    await expect(pending).resolves.toBe("done");
    expect(runCommand).toHaveBeenCalledWith(
      "pnpm test",
      expect.any(Function),
      "D:\\workspace",
    );
    expect(output).toHaveBeenCalledWith("1", "command output");
    expect(complete).toHaveBeenCalledWith("1", "done");
  });

  it("still requires review for commands not marked auto-approved", async () => {
    const runCommand = vi.fn(
      async (_command: string, onOutput?: (chunk: string) => void) => {
        onOutput?.("command output");
        return "done";
      },
    );
    const propose = vi.fn();
    const output = vi.fn();
    const complete = vi.fn();
    const manager = new CommandApprovalManager(
      {
        runCommand,
        currentWorkspaceRoot: vi.fn().mockReturnValue("D:\\workspace"),
      } as unknown as WorkspaceTools,
      { propose, start: vi.fn(), output, complete },
    );
    const pending = manager.executeOrPropose({
      tool: "run_command",
      autoApprove: false,
      arguments: { command: "pnpm test" },
    });

    expect(propose).toHaveBeenCalledOnce();
    expect(runCommand).not.toHaveBeenCalled();
    await manager.executeOrReject("1", true);
    await expect(pending).resolves.toBe("done");
    expect(output).toHaveBeenCalledWith("1", "command output");
    expect(complete).toHaveBeenCalledWith("1", "done");
  });

  it("completes a rejected command proposal instead of leaving it pending", async () => {
    const complete = vi.fn();
    const manager = new CommandApprovalManager(
      {
        runCommand: vi.fn(),
        currentWorkspaceRoot: vi.fn().mockReturnValue("D:\\workspace"),
      } as unknown as WorkspaceTools,
      { propose: vi.fn(), start: vi.fn(), output: vi.fn(), complete },
    );
    const pending = manager.executeOrPropose({
      tool: "run_command",
      autoApprove: false,
      arguments: { command: "pnpm test" },
    });

    await manager.executeOrReject("1", false);
    await expect(pending).resolves.toBe("Command denied by the user.");
    expect(complete).toHaveBeenCalledWith("1", "Command denied by the user.");
  });
});
