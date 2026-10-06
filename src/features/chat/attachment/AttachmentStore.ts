import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import type { ChatImage } from "@/provider";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from "../constants";

export interface ChatAttachmentBase {
  name: string;
  path: string;
}

export interface ChatAttachment extends ChatAttachmentBase {
  content: string;
}

export interface ChatImageAttachment extends ChatImage {
  id: string;
}

const IMAGE_MIME_TYPES = new Set<ChatImage["mimeType"]>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/**
 * Stores and manages chat attachments for the Good Buddy chat application.
 */
export class AttachmentStore {
  private items: ChatAttachment[] = [];
  private imageItems: ChatImageAttachment[] = [];

  get all(): readonly ChatAttachment[] {
    return this.items;
  }

  get allBase(): readonly ChatAttachmentBase[] {
    return this.items.map(({ name, path }) => ({ name, path }));
  }

  get images(): readonly ChatImageAttachment[] {
    return this.imageItems;
  }

  clear(): void {
    this.items = [];
    this.imageItems = [];
  }

  removeAt(index: number): void {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
    }
  }

  removeImage(id: string): void {
    this.imageItems = this.imageItems.filter((image) => image.id !== id);
  }

  addImage(name: string, mimeType: string, data: Uint8Array): void {
    const room = MAX_ATTACHMENTS - this.items.length - this.imageItems.length;
    if (room <= 0) {
      vscode.window.showWarningMessage(
        `Good Buddy supports up to ${MAX_ATTACHMENTS} attachments per message.`,
      );
      return;
    }
    if (!isImageMimeType(mimeType)) {
      vscode.window.showWarningMessage(
        `Good Buddy supports PNG, JPEG, and WebP images; skipped ${name}.`,
      );
      return;
    }
    if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_ATTACHMENT_BYTES) {
      vscode.window.showWarningMessage(
        `Good Buddy skipped ${name}: images must be smaller than 5 MB.`,
      );
      return;
    }

    this.imageItems.push({
      id: randomUUID(),
      name,
      mimeType,
      data: Buffer.from(data).toString("base64"),
    });
  }

  addImageBase64(name: string, mimeType: string, base64: string): void {
    if (base64.length > Math.ceil((MAX_IMAGE_ATTACHMENT_BYTES * 4) / 3)) {
      vscode.window.showWarningMessage(
        `Good Buddy skipped ${name}: images must be smaller than 5 MB.`,
      );
      return;
    }
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        base64,
      )
    ) {
      vscode.window.showWarningMessage(
        `Good Buddy skipped ${name}: invalid image data.`,
      );
      return;
    }
    const bytes = Buffer.from(base64, "base64");
    if (bytes.toString("base64") !== base64) {
      vscode.window.showWarningMessage(
        `Good Buddy skipped ${name}: invalid image data.`,
      );
      return;
    }
    this.addImage(name, mimeType, bytes);
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

    const room = MAX_ATTACHMENTS - this.items.length - this.imageItems.length;
    for (const uri of selected.slice(0, room)) {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const imageType = imageMimeType(uri.path);
      if (imageType) {
        this.addImage(uri.path.split("/").pop() ?? "image", imageType, bytes);
        continue;
      }

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
    if (!document || document.uri.scheme !== "file") return undefined;

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

function imageMimeType(filePath: string): ChatImage["mimeType"] | undefined {
  switch (filePath.split(".").pop()?.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return undefined;
  }
}

function isImageMimeType(value: string): value is ChatImage["mimeType"] {
  return IMAGE_MIME_TYPES.has(value as ChatImage["mimeType"]);
}
