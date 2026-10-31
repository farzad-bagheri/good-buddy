import { ChatMessage } from "@/provider";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { ChatHistoryStore, StoredChat } from "./storage/ChatHistoryStore";

export class ChatSession {
  history: ChatMessage[] = [];
  currentId?: string;
  currentCreatedAt?: string;
  currentTitle?: string;
  currentProjectUri?: string;
  currentProjectName?: string;
  private readonly deletedIds = new Set<string>();

  constructor(
    private readonly storage: ChatHistoryStore,
    private readonly output: vscode.OutputChannel,
    private readonly getSelectedModel: () => string,
    private readonly getCurrentProject: () =>
      | { uri: string; name: string }
      | undefined,
    private readonly postChatList: () => Promise<void>,
  ) {}

  ensureCurrent(): {
    id: string;
    createdAt: string;
    projectUri?: string;
    projectName?: string;
  } {
    if (!this.currentId || !this.currentCreatedAt) {
      const project = this.getCurrentProject();
      this.currentId = randomUUID();
      this.currentCreatedAt = new Date().toISOString();
      this.currentProjectUri = project?.uri;
      this.currentProjectName = project?.name;
    }
    return {
      id: this.currentId,
      createdAt: this.currentCreatedAt,
      projectUri: this.currentProjectUri,
      projectName: this.currentProjectName,
    };
  }

  setCurrent(chat: StoredChat): void {
    this.deletedIds.delete(chat.id);
    this.currentId = chat.id;
    this.currentCreatedAt = chat.createdAt;
    this.currentTitle = chat.title;
    this.currentProjectUri = chat.projectUri;
    this.currentProjectName = chat.projectName;
    this.history = chat.messages;
  }

  clear(): void {
    this.history = [];
    this.currentId = undefined;
    this.currentCreatedAt = undefined;
    this.currentTitle = undefined;
    this.currentProjectUri = undefined;
    this.currentProjectName = undefined;
  }

  async get(id: string): Promise<StoredChat | undefined> {
    return this.storage.get(id);
  }

  async list(projectUri?: string, allProjects = false) {
    return this.storage.list(projectUri, allProjects);
  }

  async delete(id: string): Promise<boolean> {
    this.deletedIds.add(id);
    try {
      await this.storage.delete(id);
      return true;
    } catch (error) {
      this.deletedIds.delete(id);
      this.output.appendLine(`Good Buddy chat: failed to delete chat: ${error}`);
      void vscode.window.showErrorMessage(
        `Good Buddy could not delete the saved chat: ${error}`,
      );
      return false;
    }
  }

  async saveCurrent(): Promise<void> {
    if (!this.currentId || !this.currentCreatedAt) return;
    await this.persist(
      this.currentId,
      this.currentCreatedAt,
      this.history,
      this.getSelectedModel(),
      undefined,
      this.currentProjectUri,
      this.currentProjectName,
    );
  }

  async persist(
    id: string,
    createdAt: string,
    messages: ChatMessage[],
    model: string,
    title?: string,
    projectUri?: string,
    projectName?: string,
  ): Promise<void> {
    if (this.deletedIds.has(id) || messages.length === 0) return;

    const firstUserMessage = messages.find(({ role }) => role === "user");
    const rawTitle =
      title ??
      this.currentTitle ??
      firstUserMessage?.displayContent ??
      firstUserMessage?.content ??
      "New chat";
    const chatTitle =
      rawTitle.split("\n", 1)[0].trim().slice(0, 80) || "New chat";
    const chat: StoredChat = {
      id,
      title: chatTitle,
      createdAt,
      updatedAt: new Date().toISOString(),
      model,
      projectUri,
      projectName,
      messages: messages.map((message) => ({ ...message })),
    };

    try {
      await this.storage.save(chat);
      await this.postChatList();
    } catch (error) {
      this.output.appendLine(`Good Buddy chat: failed to save chat: ${error}`);
    }
  }
}
