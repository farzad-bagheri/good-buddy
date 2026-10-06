import { ChatImage, ChatMessage } from "@/provider";
import * as vscode from "vscode";

export interface StoredChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messages: ChatMessage[];
}

export type ChatSummary = Pick<
  StoredChat,
  "id" | "title" | "createdAt" | "updatedAt" | "model"
>;

interface StoredImageReference {
  id: string;
  name: string;
  mimeType: ChatImage["mimeType"];
}

interface StoredChatRecord extends Omit<StoredChat, "messages"> {
  messages: (Omit<ChatMessage, "images"> & {
    images?: StoredImageReference[];
  })[];
}

interface StoredImageData {
  id: string;
  data: string;
}

export class ChatHistoryStore {
  private readonly directory: vscode.Uri;

  constructor(storageUri: vscode.Uri) {
    this.directory = vscode.Uri.joinPath(storageUri, "chats");
  }

  async list(): Promise<ChatSummary[]> {
    await vscode.workspace.fs.createDirectory(this.directory);
    const entries = await vscode.workspace.fs.readDirectory(this.directory);

    const chats = await Promise.all(
      entries
        .filter(([name]) => name.endsWith(".json"))
        .filter(([name]) => !name.endsWith(".images.json"))
        .map(async ([name]) => {
          try {
            const bytes = await vscode.workspace.fs.readFile(
              vscode.Uri.joinPath(this.directory, name),
            );
            const chat: unknown = JSON.parse(
              Buffer.from(bytes).toString("utf8"),
            );
            return isStoredChatRecord(chat) ? toSummary(chat) : undefined;
          } catch {
            return undefined;
          }
        }),
    );

    return chats
      .filter((chat): chat is ChatSummary => chat !== undefined)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(id: string): Promise<StoredChat | undefined> {
    if (!isChatId(id)) return undefined;

    let record: unknown;
    try {
      const bytes = await vscode.workspace.fs.readFile(
        getChatFileUri(this.directory, id),
      );
      record = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch {
      return undefined;
    }
    if (!isStoredChatRecord(record)) return undefined;

    const imageBytes = await this.readImageData(record.id);
    const chat = restoreImages(record, imageBytes);
    if (!chat) {
      throw new Error(
        `Image data for saved chat "${record.title}" is missing or incomplete.`,
      );
    }
    return chat;
  }

  async save(chat: StoredChat): Promise<void> {
    if (!isChatId(chat.id)) {
      throw new Error("Invalid chat id.");
    }

    await vscode.workspace.fs.createDirectory(this.directory);
    const imageData: StoredImageData[] = [];
    const record: StoredChatRecord = {
      ...chat,
      messages: chat.messages.map((message, messageIndex) => {
        const { images, ...rest } = message;
        if (!images?.length) return rest;
        return {
          ...rest,
          images: images.map(({ name, mimeType, data }, imageIndex) => {
            const imageId = `m${messageIndex}i${imageIndex}`;
            imageData.push({ id: imageId, data });
            return { id: imageId, name, mimeType };
          }),
        };
      }),
    };
    await vscode.workspace.fs.writeFile(
      getImageDataUri(this.directory, chat.id),
      Buffer.from(JSON.stringify(imageData), "utf8"),
    );
    await vscode.workspace.fs.writeFile(
      getChatFileUri(this.directory, chat.id),
      Buffer.from(JSON.stringify(record), "utf8"),
    );
  }

  async delete(id: string): Promise<void> {
    if (!isChatId(id)) return;
    await vscode.workspace.fs.delete(getChatFileUri(this.directory, id));
    try {
      await vscode.workspace.fs.delete(getImageDataUri(this.directory, id));
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
    }
  }

  private async readImageData(id: string): Promise<StoredImageData[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        getImageDataUri(this.directory, id),
      );
      const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
      if (!isStoredImageData(value)) {
        throw new Error(`Invalid image data for saved chat ${id}.`);
      }
      return value;
    } catch (error) {
      if (isFileNotFound(error)) return [];
      throw error;
    }
  }
}

function getChatFileUri(directory: vscode.Uri, id: string): vscode.Uri {
  return vscode.Uri.joinPath(directory, `${id}.json`);
}

function getImageDataUri(directory: vscode.Uri, id: string): vscode.Uri {
  return vscode.Uri.joinPath(directory, `${id}.images.json`);
}

function isChatId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function isStoredChatRecord(value: unknown): value is StoredChatRecord {
  if (!value || typeof value !== "object") return false;

  const chat = value as Partial<StoredChatRecord>;
  return (
    typeof chat.id === "string" &&
    isChatId(chat.id) &&
    typeof chat.title === "string" &&
    typeof chat.createdAt === "string" &&
    typeof chat.updatedAt === "string" &&
    typeof chat.model === "string" &&
    Array.isArray(chat.messages) &&
    chat.messages.every(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        (message.displayContent === undefined ||
          typeof message.displayContent === "string") &&
        (message.images === undefined ||
          (Array.isArray(message.images) &&
            message.images.every(
              (image) =>
                image &&
                typeof image.id === "string" &&
                typeof image.name === "string" &&
                isImageMimeType(image.mimeType),
            ))) &&
        (message.files === undefined ||
          (Array.isArray(message.files) &&
            message.files.every(
              (file) =>
                file &&
                typeof file.name === "string" &&
                typeof file.path === "string",
            ))),
    )
  );
}

function isStoredImageData(value: unknown): value is StoredImageData[] {
  return (
    Array.isArray(value) &&
    value.every(
      (image) =>
        image &&
        typeof image.id === "string" &&
        typeof image.data === "string" &&
        isBase64(image.data),
    )
  );
}

function restoreImages(
  record: StoredChatRecord,
  imageData: StoredImageData[],
): StoredChat | undefined {
  const dataById = new Map(imageData.map(({ id, data }) => [id, data]));
  const messages: ChatMessage[] = [];
  for (const message of record.messages) {
    const { images, ...rest } = message;
    if (!images?.length) {
      messages.push(rest);
      continue;
    }
    const restored: ChatImage[] = [];
    for (const { id, name, mimeType } of images) {
      const data = dataById.get(id);
      if (data === undefined) return undefined;
      restored.push({ name, mimeType, data });
    }
    messages.push({
      ...rest,
      images: restored,
    });
  }
  return { ...record, messages };
}

function isImageMimeType(value: unknown): value is ChatImage["mimeType"] {
  return (
    value === "image/png" ||
    value === "image/jpeg" ||
    value === "image/webp"
  );
}

function isBase64(value: string): boolean {
  return (
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) && Buffer.from(value, "base64").toString("base64") === value
  );
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof vscode.FileSystemError && error.code === "FileNotFound"
  );
}

function toSummary({
  id,
  title,
  createdAt,
  updatedAt,
  model,
}: StoredChatRecord): ChatSummary {
  return { id, title, createdAt, updatedAt, model };
}
