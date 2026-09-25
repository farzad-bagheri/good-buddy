import { ToolCall } from "./types";
import { toolArgument } from "./utils";
import { WorkspaceTools } from "./tools/WorkspaceTools";

interface PendingCommand {
  command: string;
  resolve: (result: string) => void;
}

export interface CommandApprovalEvents {
  propose(id: string, command: string): void;
}

export class CommandApprovalManager {
  private readonly pending = new Map<string, PendingCommand>();
  private nextId = 1;

  constructor(
    private readonly workspaceTools: WorkspaceTools,
    private readonly events: CommandApprovalEvents,
  ) {}

  execute(toolCall: ToolCall): Promise<string> {
    const command = toolArgument(toolCall, "command");
    const id = String(this.nextId++);
    this.events.propose(id, command);
    return new Promise((resolve) => this.pending.set(id, { command, resolve }));
  }

  async review(id: string, approved: boolean): Promise<void> {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.resolve(
      approved
        ? await this.workspaceTools.runCommand(pending.command)
        : "Command denied by the user.",
    );
  }

  rejectAll(reason = "Command denied because the chat was reset."): void {
    for (const pending of this.pending.values()) pending.resolve(reason);
    this.pending.clear();
  }
}
