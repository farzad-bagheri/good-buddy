import * as vscode from "vscode";

interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

export interface ChatWebviewMessageHandlers {
  ready(): Promise<void>;
  checkProvider(): Promise<void>;
  openSettings(): Promise<void>;
  openFile(filePath: string): Promise<void>;
  send(text: string): Promise<void>;
  retry(historyIndex: number): Promise<void>;
  attachFiles(): Promise<void>;
  removeAttachment(index: number): void;
  selectModel(model: unknown): Promise<void>;
  selectCompletionModel(model: unknown): Promise<void>;
  newChat(): Promise<void>;
  listChats(): Promise<void>;
  resumeChat(id: string): Promise<void>;
  deleteChat(id: string): Promise<void>;
  cancel(): void;
  reviewWrite(id: string, approved: boolean): Promise<void>;
  reviewCommand(id: string, approved: boolean): Promise<void>;
}

export class ChatWebviewMessageRouter {
  constructor(
    private readonly webview: vscode.Webview,
    private readonly handlers: ChatWebviewMessageHandlers,
  ) {}

  register(): vscode.Disposable {
    return this.webview.onDidReceiveMessage((message: WebviewMessage) => {
      switch (message.type) {
        case "wv:ready":
          return this.handlers.ready();
        case "wv:checkProvider":
          return this.handlers.checkProvider();
        case "wv:openSettings":
          return this.handlers.openSettings();
        case "wv:openFile":
          return this.handlers.openFile(String(message.filePath ?? ""));
        case "wv:send":
          return this.handlers.send(String(message.text ?? ""));
        case "wv:retry":
          return this.handlers.retry(Number(message.historyIndex));
        case "wv:attachFiles":
          return this.handlers.attachFiles();
        case "wv:removeAttachment":
          return this.handlers.removeAttachment(Number(message.index));
        case "wv:selectModel":
          return this.handlers.selectModel(message.model);
        case "wv:selectCompletionModel":
          return this.handlers.selectCompletionModel(message.model);
        case "wv:newChat":
          return this.handlers.newChat();
        case "wv:listChats":
          return this.handlers.listChats();
        case "wv:resumeChat":
          return this.handlers.resumeChat(String(message.id ?? ""));
        case "wv:deleteChat":
          return this.handlers.deleteChat(String(message.id ?? ""));
        case "wv:cancel":
          return this.handlers.cancel();
        case "wv:reviewWrite":
          return this.handlers.reviewWrite(
            String(message.id ?? ""),
            Boolean(message.approved),
          );
        case "wv:reviewCommand":
          return this.handlers.reviewCommand(
            String(message.id ?? ""),
            Boolean(message.approved),
          );
      }
    });
  }
}
