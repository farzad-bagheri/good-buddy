import { WorkspaceTools } from "../tools";
import { ToolCall } from "../types";
import { formatError, toolArgument } from "../utils";

interface PendingWrite {
  path: string;
  before: string;
  after: string;
  /**
   * Resolves the pending write operation with the given result.
   * @param result The result of the write operation, either a success message or a denial message.
   * @returns void
   */
  resolve: (result: string) => void;
}

export interface WriteApprovalEvents {
  propose(id: string, path: string, diff: string): void;
}

/**
 * Manages the approval process for write operations in the workspace.
 * Keeps track of pending writes and handles user approval or rejection.
 */
export class WriteApprovalManager {
  /**
   * A map of pending write operations, keyed by their unique ID.
   */
  private readonly pending = new Map<string, PendingWrite>();
  private nextId = 1;

  constructor(
    private readonly workspaceTools: WorkspaceTools,
    private readonly events: WriteApprovalEvents,
  ) {}

  /**
   * Executes the given write tool call, requesting user approval if necessary.
   * @param toolCall The tool call containing the write operation.
   * @returns A promise that resolves with the result of the write operation or a denial message.
   */
  async executeOrPropose(toolCall: ToolCall): Promise<string> {
    const path = toolArgument(toolCall, "path");
    const edit =
      toolCall.tool === "replace_in_file"
        ? await this.workspaceTools.proposeReplacement(
            path,
            toolArgument(toolCall, "oldText"),
            toolArgument(toolCall, "newText"),
          )
        : undefined;

    // Determine the content of the file before the write operation.
    const before =
      edit?.before ?? (await this.workspaceTools.currentContent(path));

    // Determine the content of the file after the write operation.
    const content = edit?.after ?? toolArgument(toolCall, "content");

    // If the tool call is auto-approved, apply the write immediately. Otherwise, propose it for user approval.
    if (toolCall.autoApprove) {
      try {
        return await this.workspaceTools.applyWrite(path, before, content);
      } catch (error) {
        return `Tool error: ${formatError(error)}`;
      }
    }

    // Propose the write operation to the user if it is not auto-approved.
    const proposal =
      edit?.proposal ?? (await this.workspaceTools.proposeWrite(path, content));
    const id = String(this.nextId++);
    this.events.propose(id, proposal.path, proposal.diff);

    // Return a promise that will be resolved once the user reviews the write operation.
    return new Promise((resolve) =>
      this.pending.set(id, { path, before, after: content, resolve }),
    );
  }

  /**
   * Reviews a pending write operation, applying it if approved or rejecting it otherwise.
   * @param id The unique ID of the pending write operation.
   * @param approved Whether the write operation is approved by the user.
   */
  async review(id: string, approved: boolean): Promise<void> {
    const pending = this.pending.get(id);
    if (!pending) return;

    this.pending.delete(id);

    if (!approved) {
      pending.resolve("Write denied by the user.");
      return;
    }

    try {
      pending.resolve(
        await this.workspaceTools.applyWrite(
          pending.path,
          pending.before,
          pending.after,
        ),
      );
    } catch (error) {
      pending.resolve(`Tool error: ${formatError(error)}`);
    }
  }

  rejectAll(reason = "Write denied because the chat was reset."): void {
    for (const pending of this.pending.values()) pending.resolve(reason);
    this.pending.clear();
  }
}
