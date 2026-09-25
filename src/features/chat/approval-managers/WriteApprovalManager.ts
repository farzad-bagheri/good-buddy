import { WorkspaceTools } from "../tools";
import { ToolCall } from "../types";
import { formatError, toolArgument } from "../utils";

interface PendingWrite {
  path: string;
  before: string;
  after: string;
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

  async execute(toolCall: ToolCall): Promise<string> {
    const path = toolArgument(toolCall, "path");
    const edit =
      toolCall.tool === "replace_in_file"
        ? await this.workspaceTools.proposeReplacement(
            path,
            toolArgument(toolCall, "oldText"),
            toolArgument(toolCall, "newText"),
          )
        : undefined;
    const before =
      edit?.before ?? (await this.workspaceTools.currentContent(path));
    const content = edit?.after ?? toolArgument(toolCall, "content");
    const proposal =
      edit?.proposal ?? (await this.workspaceTools.proposeWrite(path, content));
    if (toolCall.autoApprove) {
      try {
        return await this.workspaceTools.applyWrite(path, before, content);
      } catch (error) {
        return `Tool error: ${formatError(error)}`;
      }
    }

    const id = String(this.nextId++);

    this.events.propose(id, proposal.path, proposal.diff);
    return new Promise((resolve) =>
      this.pending.set(id, { path, before, after: content, resolve }),
    );
  }

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
