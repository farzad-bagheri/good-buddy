import * as vscode from "vscode";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "../constants";

export interface ChatAttachment {
  name: string;
  content: string;
}

/**
 * Stores and manages chat attachments for the Good Buddy chat application.
 */
export class AttachmentStore {
  private items: ChatAttachment[] = [];

  get all(): readonly ChatAttachment[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
  }

  removeAt(index: number): void {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
    }
  }

  /**
   * Prompts the user to pick files to attach to the chat.
   */
  async pick(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: "Attach to Good Buddy chat",
    });
    if (!selected) return;

    const room = MAX_ATTACHMENTS - this.items.length;
    for (const uri of selected.slice(0, room)) {
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.length > MAX_ATTACHMENT_BYTES || bytes.includes(0)) {
        vscode.window.showWarningMessage(
          `Good Buddy skipped ${uri.path.split("/").pop()}: attachments must be text files under ${MAX_ATTACHMENT_BYTES / 1024} KB.`,
        );
        continue;
      }
      this.items.push({
        name: uri.path.split("/").pop() ?? "file",
        content: Buffer.from(bytes).toString("utf8"),
      });
    }
  }

  /**
   * Formats all attached files for inclusion in a chat prompt.
   */
  formatForPrompt(defaultAttachment?: ChatAttachment): string {
    return this.withDefault(defaultAttachment)
      .map(
        (attachment) =>
          `\n\nAttached file: ${attachment.name}\n\`\`\`\n${attachment.content}\n\`\`\``,
      )
      .join("");
  }

  /**
   * Returns the names of all attached files.
   */
  names(defaultAttachment?: ChatAttachment): string[] {
    return this.withDefault(defaultAttachment).map(
      (attachment) => attachment.name,
    );
  }

  private withDefault(defaultAttachment?: ChatAttachment): ChatAttachment[] {
    if (!defaultAttachment) return [...this.items];
    return [
      defaultAttachment,
      ...this.items.filter(
        (attachment) =>
          attachment.name !== defaultAttachment.name ||
          attachment.content !== defaultAttachment.content,
      ),
    ];
  }
}
