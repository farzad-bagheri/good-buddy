import * as vscode from "vscode";

export interface ChatAttachment {
  name: string;
  content: string;
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 80_000;

export class AttachmentStore {
  private items: ChatAttachment[] = [];

  get all(): readonly ChatAttachment[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
  }

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
          `Good Buddy skipped ${uri.path.split("/").pop()}: attachments must be text files under 80 KB.`,
        );
        continue;
      }
      this.items.push({
        name: uri.path.split("/").pop() ?? "file",
        content: Buffer.from(bytes).toString("utf8"),
      });
    }
  }

  formatForPrompt(): string {
    return this.items
      .map(
        (attachment) =>
          `\n\nAttached file: ${attachment.name}\n\`\`\`\n${attachment.content}\n\`\`\``,
      )
      .join("");
  }

  names(): string[] {
    return this.items.map((attachment) => attachment.name);
  }
}
