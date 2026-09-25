import { WorkspaceTools } from "../tools";
import { ToolCall } from "../types";
import { toolArgument } from "../utils";

interface PendingCommand {
  command: string;
  resolve: (result: string) => void;
}

export interface CommandApprovalEvents {
  /**
   * Called when a command requires user approval.
   * @param id The unique identifier for the pending command.
   * @param command The command that requires approval.
   */
  propose(id: string, command: string): void;
}

/**
 * Manages the approval process for running commands in the workspace.
 * Keeps track of pending commands and handles user approval or rejection.
 */
export class CommandApprovalManager {
  private readonly pending = new Map<string, PendingCommand>();
  private nextId = 1;

  constructor(
    private readonly workspaceTools: WorkspaceTools,
    private readonly events: CommandApprovalEvents,
  ) {}

  /**
   * Executes the given tool call, requesting user approval if necessary.
   * @param toolCall The tool call containing the command to be executed.
   * @returns A promise that resolves with the result of the command execution or a denial message.
   */
  async executeOrPropose(toolCall: ToolCall): Promise<string> {
    const command = toolArgument(toolCall, "command");
    if (toolCall.autoApprove) {
      return this.workspaceTools.runCommand(command);
    }

    // Propose the command to the user for approval.
    const id = String(this.nextId++);
    this.events.propose(id, command);

    // Return a promise that will be resolved once the user reviews the command.
    return new Promise((resolve) => this.pending.set(id, { command, resolve }));
  }

  /**
   * Reviews a pending command, executing it if approved or rejecting it otherwise.
   * @param id The unique identifier for the pending command.
   * @param approved Whether the command is approved by the user.
   */
  async executeOrReject(id: string, approved: boolean): Promise<void> {
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
