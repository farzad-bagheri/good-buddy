import * as vscode from "vscode";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "../constants";

export interface ChatAttachmentBase {
  name: string;
  path: string;
}

export interface ChatAttachment extends ChatAttachmentBase {
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

  get allBase(): readonly ChatAttachmentBase[] {
    return this.items.map(({ name, path }) => ({ name, path }));
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

      const attachment = {
        name: uri.path.split("/").pop() ?? "file",
        path: vscode.workspace.asRelativePath(uri),
        content: Buffer.from(bytes).toString("utf8"),
      };

      if (!this.isValidAttachment(attachment)) {
        vscode.window.showWarningMessage(
          `Good Buddy skipped ${uri.path.split("/").pop()}: invalid attachment.`,
        );
        continue;
      }

      this.items.push(attachment);
    }
  }

  activeDocumentAttachment(): ChatAttachment | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) return undefined;

    const content = document.getText();

    const candidateAttachment = {
      name: document.uri.path.split("/").pop() || document.fileName,
      path: vscode.workspace.asRelativePath(document.uri),
      content,
    };

    if (!this.isValidAttachment(candidateAttachment)) {
      return undefined;
    }

    return candidateAttachment;
  }

  /**
   * Formats all attached files for inclusion in a chat prompt.
   */
  formatForPrompt(defaultAttachment?: ChatAttachment): string {
    return this.withDefault(defaultAttachment)
      .map(
        (attachment) =>
          `\n\nAttached file: ${attachment.path}\n\`\`\`\n${attachment.content}\n\`\`\``,
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
        (attachment) => attachment.path !== defaultAttachment.path,
      ),
    ];
  }

  private isValidAttachment(attachment: ChatAttachment): boolean {
    const nonBinary = !attachment.content.includes("\0");
    const withinSizeLimit =
      Buffer.byteLength(attachment.content, "utf8") <= MAX_ATTACHMENT_BYTES;
    const notEmpty = attachment.content.length > 0;
    const unique = !this.items.some((item) => item.path === attachment.path);
    return nonBinary && withinSizeLimit && notEmpty && unique;
  }
}
