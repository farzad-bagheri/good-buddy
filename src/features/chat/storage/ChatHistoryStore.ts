import { ChatMessage } from "@/provider";
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
        .map(async ([name]) => {
          try {
            const bytes = await vscode.workspace.fs.readFile(
              vscode.Uri.joinPath(this.directory, name),
            );
            const chat: unknown = JSON.parse(
              Buffer.from(bytes).toString("utf8"),
            );
            return isStoredChat(chat) ? toSummary(chat) : undefined;
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

    try {
      const bytes = await vscode.workspace.fs.readFile(
        getChatFileUri(this.directory, id),
      );
      const chat: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
      return isStoredChat(chat) ? chat : undefined;
    } catch {
      return undefined;
    }
  }

  async save(chat: StoredChat): Promise<void> {
    if (!isChatId(chat.id)) {
      throw new Error("Invalid chat id.");
    }

    await vscode.workspace.fs.createDirectory(this.directory);
    await vscode.workspace.fs.writeFile(
      getChatFileUri(this.directory, chat.id),
      Buffer.from(JSON.stringify(chat), "utf8"),
    );
  }

  async delete(id: string): Promise<void> {
    if (!isChatId(id)) return;

    try {
      await vscode.workspace.fs.delete(
        getChatFileUri(this.directory, id),
      );
    } catch {
      // A missing chat is already deleted.
    }
  }
}

function getChatFileUri(directory: vscode.Uri, id: string): vscode.Uri {
  return vscode.Uri.joinPath(directory, `${id}.json`);
}

function isChatId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function isStoredChat(value: unknown): value is StoredChat {
  if (!value || typeof value !== "object") return false;

  const chat = value as Partial<StoredChat>;
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
          typeof message.displayContent === "string"),
    )
  );
}

function toSummary({
  id,
  title,
  createdAt,
  updatedAt,
  model,
}: StoredChat): ChatSummary {
  return { id, title, createdAt, updatedAt, model };
}
