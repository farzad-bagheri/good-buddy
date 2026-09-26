import { describe, expect, it, vi } from "vitest";
import { CommandApprovalManager } from "./CommandApprovalManager";
import { WriteApprovalManager } from "./WriteApprovalManager";
import type { WorkspaceTools } from "../tools";
import type { ToolCall } from "../types";
import { parseToolCall } from "../utils";

describe("approval managers", () => {
  it("only accepts a literal true autoApprove flag", () => {
    expect(
      parseToolCall('{"tool":"run_command","autoApprove":"false"}'),
    ).toMatchObject({ autoApprove: false });
    expect(
      parseToolCall('{"tool":"run_command","autoApprove":true}'),
    ).toMatchObject({ autoApprove: true });
  });

  it("executes auto-approved writes without proposing them", async () => {
    const applyWrite = vi.fn().mockResolvedValue("Wrote notes.txt.");
    const propose = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentContent: vi.fn().mockResolvedValue("before"),
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

    await expect(manager.executeOrPropose(toolCall)).resolves.toBe(
      "Wrote notes.txt.",
    );

    expect(applyWrite).toHaveBeenCalledWith("notes.txt", "before", "after");
    expect(propose).not.toHaveBeenCalled();
  });

  it("still requires review for writes not marked auto-approved", async () => {
    const applyWrite = vi.fn().mockResolvedValue("Wrote notes.txt.");
    const propose = vi.fn();
    const complete = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentContent: vi.fn().mockResolvedValue("before"),
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
    expect(applyWrite).not.toHaveBeenCalled();
    await manager.review("1", true);
    await expect(pending).resolves.toBe("Wrote notes.txt.");
    expect(complete).toHaveBeenCalledWith("1", "Wrote notes.txt.");
  });

  it("reports pending writes cancelled when the active turn is abandoned", async () => {
    const complete = vi.fn();
    const propose = vi.fn();
    const applyWrite = vi.fn();
    const manager = new WriteApprovalManager(
      {
        currentContent: vi.fn().mockResolvedValue("before"),
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

  it("executes auto-approved commands without proposing them", async () => {
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
      { runCommand } as unknown as WorkspaceTools,
      { propose, start, output, complete },
    );

    await expect(
      manager.executeOrPropose({
        tool: "run_command",
        autoApprove: true,
        arguments: { command: "pnpm test" },
      }),
    ).resolves.toBe("done");

    expect(runCommand).toHaveBeenCalledWith("pnpm test", expect.any(Function));
    expect(propose).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith("1", "pnpm test");
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
      { runCommand } as unknown as WorkspaceTools,
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
});
