import { WorkspaceTools } from "../tools";
import { ToolCall } from "../types";
import { formatError, toolArgument } from "../utils";

interface PendingCommand {
  command: string;
  root: string;
  resolve: (result: string) => void;
}

export interface CommandApprovalEvents {
  /**
   * Called when a command requires user approval.
   * @param id The unique identifier for the pending command.
   * @param command The command that requires approval.
   */
  propose(id: string, command: string): void;
  start(id: string, command: string): void;
  output(id: string, chunk: string): void;
  complete(id: string, result: string): void;
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
    const root = toolCall.workspaceRoot ?? this.workspaceTools.currentWorkspaceRoot();
    const id = String(this.nextId++);
    // Commands always require a user review; autoApprove is never trusted from a model.
    this.events.propose(id, command);

    // Return a promise that will be resolved once the user reviews the command.
    return new Promise((resolve) => this.pending.set(id, { command, root, resolve }));
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

    if (approved) {
      pending.resolve(await this.runCommand(id, pending.command, pending.root));
      return;
    }

    const result = "Command denied by the user.";
    this.events.complete(id, result);
    pending.resolve(result);
  }

  private async runCommand(
    id: string,
    command: string,
    root: string,
  ): Promise<string> {
    let result: string;
    this.events.start(id, command);
    try {
      result = await this.workspaceTools.runCommand(
        command,
        (chunk) => this.events.output(id, chunk),
        root,
      );
    } catch (error) {
      result = `Command failed: ${formatError(error)}`;
    }
    this.events.complete(id, result);
    return result;
  }

  rejectAll(reason = "Command denied because the chat was reset."): void {
    for (const [id, pending] of this.pending) {
      this.events.complete(id, reason);
      pending.resolve(reason);
    }
    this.pending.clear();
  }
}
