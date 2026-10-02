import { getGoodBuddyConfig } from "@/config";
import { ChatMessage, GoodBuddyProvider, ProviderModel } from "@/provider";
import { Resources } from "@/resources";
import { marked } from "marked";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { ChatAgent } from "./agent";
import {
  CommandApprovalManager,
  WriteApprovalManager,
} from "./approval-managers";
import { AttachmentStore } from "./attachment";
import { shellHtml } from "./shell";
import { ChatHistoryStore, StoredChat } from "./storage/ChatHistoryStore";
import { ToolRegistry } from "./tools";
import { WorkspaceTools } from "./tools/WorkspaceTools";
import { findMissingModels, findRetryUserIndex, formatError } from "./utils";

const MODEL_STATE_KEY = "goodBuddy.selectedChatModel";

export class ChatFeature implements vscode.WebviewViewProvider {
  public static readonly viewType = "goodBuddy.chatView";

  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private activeController?: AbortController;
  private readonly resources: Resources;
  private readonly chatStorage: ChatHistoryStore;
  private currentChatId?: string;
  private currentChatCreatedAt?: string;
  private currentChatTitle?: string;
  private readonly deletedChatIds = new Set<string>();
  private readonly workspaceTools = new WorkspaceTools();
  private readonly attachments = new AttachmentStore();
  private readonly writeApprovals: WriteApprovalManager;
  private readonly commandApprovals: CommandApprovalManager;
  private readonly tools: ToolRegistry;
  private readonly agent: ChatAgent;

  /** Initializes chat tools, approval managers, and the chat agent. */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly provider: GoodBuddyProvider,
  ) {
    this.resources = new Resources(context);
    this.chatStorage = new ChatHistoryStore(context.globalStorageUri);
    this.writeApprovals = new WriteApprovalManager(this.workspaceTools, {
      // Handle write proposals from the workspace tools.
      propose: (id, path, diff) =>
        this.view?.webview.postMessage({
          type: "vsc:writeProposal",
          id,
          path,
          diff,
        }),
      complete: (id, result) =>
        this.view?.webview.postMessage({
          type: "vsc:writeComplete",
          id,
          result,
        }),
    });

    // Initialize the command approval manager.
    this.commandApprovals = new CommandApprovalManager(this.workspaceTools, {
      propose: (id, command) =>
        this.view?.webview.postMessage({
          type: "vsc:commandProposal",
          id,
          command,
        }),
      start: (id, command) =>
        this.view?.webview.postMessage({
          type: "vsc:commandStart",
          id,
          command,
        }),
      output: (id, text) =>
        this.view?.webview.postMessage({
          type: "vsc:commandOutput",
          id,
          text,
        }),
      complete: (id, result) =>
        this.view?.webview.postMessage({
          type: "vsc:commandComplete",
          id,
          result,
        }),
    });

    // Initialize the tool registry and chat agent.
    const registeredTools = this.workspaceTools.createTools(
      (tool) => this.writeApprovals.executeOrPropose(tool),
      (call) => this.commandApprovals.executeOrPropose(call),
    );
    this.tools = new ToolRegistry(registeredTools);

    // Initialize the chat agent with the provider, output channel, workspace tools, tool registry, and event handlers.
    this.agent = new ChatAgent(
      provider,
      output,
      this.workspaceTools,
      this.tools,
      {
        onToolStatus: (tool) =>
          this.view?.webview.postMessage({
            type: "vsc:toolStatus",
            tool,
          }),
        onModelStatus: (waiting, signal) => {
          if (this.activeController?.signal !== signal) return;
          this.view?.webview.postMessage({ type: "vsc:modelStatus", waiting });
        },
      },
    );

    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.postAttachments()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("goodBuddy")) {
          void this.sendModelList();
        }
      }),
    );
  }

  /** Configures the chat webview and handles messages sent by its UI. */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const chatWebviewRoot = vscode.Uri.joinPath(
      this.context.extensionUri,
      "out",
      "webview",
      "chat",
    );
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        chatWebviewRoot,
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    // Handle incoming messages from the webview.
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "wv:ready":
          await this.sendModelList();
          await this.postHistory();
          this.postAttachments();
          await this.postChatList();
          break;
        case "wv:checkProvider":
          await this.sendModelList();
          break;
        case "wv:openSettings":
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@ext:dabanli.good-buddy",
          );
          break;
        case "wv:send":
          await this.handleSend(String(message.text ?? ""));
          break;
        case "wv:retry":
          await this.handleRetry(Number(message.historyIndex));
          break;
        case "wv:attachFiles":
          await this.pickAttachments();
          break;
        case "wv:removeAttachment":
          this.attachments.removeAt(Number(message.index));
          this.postAttachments();
          break;
        case "wv:selectModel":
          await this.context.globalState.update(MODEL_STATE_KEY, message.model);
          await this.sendModelList();
          break;
        case "wv:newChat":
          this.activeController?.abort();
          this.writeApprovals.rejectAll();
          this.commandApprovals.rejectAll();
          await this.saveCurrentChat();
          this.history = [];
          this.currentChatId = undefined;
          this.currentChatCreatedAt = undefined;
          this.currentChatTitle = undefined;
          this.attachments.clear();
          this.postAttachments();
          await this.postHistory();
          await this.postChatList();
          break;
        case "wv:listChats":
          await this.postChatList();
          break;
        case "wv:resumeChat":
          await this.resumeChat(String(message.id ?? ""));
          break;
        case "wv:deleteChat":
          await this.confirmDeleteChat(String(message.id ?? ""));
          break;
        case "wv:cancel":
          this.activeController?.abort();
          break;
        case "wv:reviewWrite":
          await this.writeApprovals.review(
            String(message.id ?? ""),
            Boolean(message.approved),
          );
          break;
        case "wv:reviewCommand":
          await this.commandApprovals.executeOrReject(
            String(message.id ?? ""),
            Boolean(message.approved),
          );
          break;
      }
    });
  }

  /** Returns the saved chat model, falling back to the configured default. */
  private getSelectedModel(): string {
    const { chatModel } = getGoodBuddyConfig();
    return this.context.globalState.get<string>(MODEL_STATE_KEY, chatModel);
  }

  /** Sends available models to the webview, falling back to the configured model on failure. */
  private async sendModelList(): Promise<void> {
    this.postProviderStatus("checking");
    try {
      const models = await this.provider.listModels();
      this.view?.webview.postMessage({
        type: "vsc:models",
        models,
        selected: this.getSelectedModel(),
      });
      const missingModels = findMissingModels(
        models.map(({ model }) => model),
        [this.getSelectedModel(), getGoodBuddyConfig().completionModel],
      );
      this.postProviderStatus(
        missingModels.length ? "models-missing" : "ready",
        missingModels,
      );
    } catch (err) {
      this.output.appendLine(`Good Buddy chat: failed to list models: ${err}`);
      this.view?.webview.postMessage({
        type: "vsc:models",
        models: [],
        selected: this.getSelectedModel(),
      });
      this.postProviderStatus("unavailable");
    }
  }

  private postProviderStatus(
    status: "checking" | "unavailable" | "models-missing" | "ready",
    missingModels: string[] = [],
  ): void {
    const webview = this.view?.webview;
    if (!webview) return;

    webview.postMessage({
      type: "vsc:providerStatus",
      status,
      endpoint: getGoodBuddyConfig().endpoint,
      chatModel:  getGoodBuddyConfig().chatModel,
      completionModel: getGoodBuddyConfig().completionModel,
      missingModels,
      artworkUri: this.resources
        .getIcon("provider-offline")
        .asWebUri(webview)
        .toString(),
    });
  }

  private async modelDetails(model: string): Promise<ProviderModel | null> {
    try {
      const models = await this.provider.listModels();
      return models.find((m) => m.model === model) ?? null;
    } catch (err) {
      this.output.appendLine(`Good Buddy chat: failed to list models: ${err}`);
    }
    return null;
  }

  /** Sends chat history to the webview, rendering assistant messages as HTML. */
  private postHistory(thinking = false) {
    const messages = this.history.map(
      ({ role, content, displayContent, suggestions }, historyIndex) => ({
        role,
        content: marked.parse(displayContent ?? content),
        suggestions,
        historyIndex,
      }),
    );
    this.view?.webview.postMessage({
      type: "vsc:history",
      messages,
      thinking,
    });
  }

  private async postChatList(): Promise<void> {
    try {
      this.view?.webview.postMessage({
        type: "vsc:chatList",
        chats: await this.chatStorage.list(),
      });
    } catch (err) {
      this.output.appendLine(
        `Good Buddy chat: failed to list saved chats: ${err}`,
      );
    }
  }

  private async saveCurrentChat(): Promise<void> {
    if (!this.currentChatId || !this.currentChatCreatedAt) return;
    await this.persistChat(
      this.currentChatId,
      this.currentChatCreatedAt,
      this.history,
      this.getSelectedModel(),
    );
  }

  private async persistChat(
    id: string,
    createdAt: string,
    messages: ChatMessage[],
    model: string,
    title?: string,
  ): Promise<void> {
    if (this.deletedChatIds.has(id) || messages.length === 0) return;

    const firstUserMessage = messages.find(({ role }) => role === "user");
    const rawTitle =
      title ??
      this.currentChatTitle ??
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
      messages: messages.map((message) => ({ ...message })),
    };

    try {
      await this.chatStorage.save(chat);
      await this.postChatList();
    } catch (err) {
      this.output.appendLine(`Good Buddy chat: failed to save chat: ${err}`);
    }
  }

  private async resumeChat(id: string): Promise<void> {
    const chat = await this.chatStorage.get(id);
    if (!chat) return;

    this.activeController?.abort();
    this.writeApprovals.rejectAll();
    this.commandApprovals.rejectAll();
    this.deletedChatIds.delete(chat.id);
    this.currentChatId = chat.id;
    this.currentChatCreatedAt = chat.createdAt;
    this.currentChatTitle = chat.title;
    this.history = chat.messages;
    this.attachments.clear();
    await this.context.globalState.update(MODEL_STATE_KEY, chat.model);
    await this.sendModelList();
    this.postAttachments();
    await this.postHistory();
    await this.postChatList();
  }

  private async confirmDeleteChat(id: string): Promise<void> {
    const chat = await this.chatStorage.get(id);
    if (!chat) {
      await this.postChatList();
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Delete "${chat.title}"? This cannot be undone.`,
      { modal: true },
      "Delete",
    );
    if (choice !== "Delete") return;

    await this.deleteChat(id);
  }

  private async deleteChat(id: string): Promise<void> {
    this.deletedChatIds.add(id);
    try {
      await this.chatStorage.delete(id);
    } catch (err) {
      this.deletedChatIds.delete(id);
      this.output.appendLine(`Good Buddy chat: failed to delete chat: ${err}`);
      void vscode.window.showErrorMessage(
        `Good Buddy could not delete the saved chat: ${err}`,
      );
      return;
    }

    if (id === this.currentChatId) {
      this.activeController?.abort();
      this.writeApprovals.rejectAll();
      this.commandApprovals.rejectAll();
      this.currentChatId = undefined;
      this.currentChatCreatedAt = undefined;
      this.currentChatTitle = undefined;
      this.history = [];
      this.postAttachments();
      await this.postHistory();
    }

    await this.postChatList();
  }

  private ensureCurrentChat(): { id: string; createdAt: string } {
    if (!this.currentChatId || !this.currentChatCreatedAt) {
      this.currentChatId = randomUUID();
      this.currentChatCreatedAt = new Date().toISOString();
    }
    return {
      id: this.currentChatId,
      createdAt: this.currentChatCreatedAt,
    };
  }

  private async handleRetry(assistantIndex: number): Promise<void> {
    if (this.activeController) return;

    const userIndex = findRetryUserIndex(this.history, assistantIndex);
    if (userIndex === undefined) return;

    const userMessage = this.history[userIndex];
    this.history = this.history.slice(0, userIndex);
    this.postHistory(true);
    await this.handleSend(userMessage.content, userMessage);
  }

  /** Adds a user message and runs the agent, reporting its result to the webview. */
  private async handleSend(
    userMessage: string,
    replayMessage?: ChatMessage,
  ): Promise<void> {
    // Return early if a new message is empty and has no attachments, or the webview is unavailable.
    if (
      (!replayMessage &&
        !userMessage.trim() &&
        this.attachments.all.length === 0) ||
      !this.view
    ) {
      return;
    }

    // Abort any ongoing request before starting a new one.
    this.activeController?.abort();
    this.writeApprovals.rejectAll(
      "Write cancelled because a new chat request was sent.",
    );
    const modelName = this.getSelectedModel();
    const selectedModel = await this.modelDetails(modelName);
    const activeDocument = replayMessage
      ? undefined
      : this.attachments.activeDocumentAttachment();
    const attachmentBlock = replayMessage
      ? ""
      : this.attachments.formatForPrompt(activeDocument);
    const userContent =
      replayMessage?.content ?? `${userMessage}${attachmentBlock}`.trim();
    const attachmentLabel = replayMessage
      ? ""
      : this.attachments.all.length
        ? `\n\n>Attached: ${this.attachments.names(activeDocument).join(", ")}`
        : activeDocument
          ? `\n\n>Open file: ${activeDocument.name}`
          : "";
    const displayContent =
      replayMessage?.displayContent ??
      `${userMessage}${attachmentLabel}`.trim();
    if (!replayMessage) {
      this.attachments.clear();
      this.postAttachments();
    }
    const conversation = this.history;
    const { id, createdAt } = this.ensureCurrentChat();
    conversation.push({
      role: "user",
      content: userContent,
      displayContent,
    });
    this.view.webview.postMessage({
      type: "vsc:userMessage",
      text: displayContent,
      html: marked.parse(displayContent),
      historyIndex: conversation.length - 1,
    });

    // Prepare to run the agent and generate the assistant's response.
    const controller = new AbortController();
    this.activeController = controller;

    let assistantText = "";
    try {
      if (controller.signal.aborted || this.currentChatId !== id) return;

      // Run the agent to generate the assistant's response.
      const result = await this.agent.run(
        conversation,
        selectedModel,
        controller.signal,
      );
      assistantText = result.response;
      const chatTitle = result.title ?? this.currentChatTitle;
      if (this.currentChatId === id && result.title) {
        this.currentChatTitle = result.title;
      }
      if (controller.signal.aborted || this.currentChatId !== id) {
        if (assistantText) {
          conversation.push({ role: "assistant", content: assistantText });
          await this.persistChat(
            id,
            createdAt,
            conversation,
            modelName,
            chatTitle,
          );
        }
        return;
      }

      conversation.push({
        role: "assistant",
        content: assistantText,
        suggestions: result.suggestions,
      });
      const assistantHtml = marked.parse(assistantText);
      // Notify the webview that the assistant has started generating its response.
      this.view.webview.postMessage({
        type: "vsc:assistantStart",
        historyIndex: conversation.length - 1,
      });
      // Send the initial chunk of the assistant's response to the webview.
      this.view.webview.postMessage({
        type: "vsc:assistantChunk",
        text: assistantText,
        html: assistantHtml,
      });
      // Notify the webview that the assistant has finished generating its response.
      this.view.webview.postMessage({
        type: "vsc:assistantDone",
        suggestions: result.suggestions,
      });
      void this.persistChat(id, createdAt, conversation, modelName, chatTitle);
    } catch (err) {
      // If an error occurs and the request was not aborted, notify the webview of the error.
      if (!controller.signal.aborted) {
        if (this.currentChatId === id) {
          this.view?.webview.postMessage({
            type: "vsc:assistantError",
            text: formatError(err),
          });
          await this.persistChat(id, createdAt, conversation, modelName);
        }
      } else {
        // If the request was aborted, but some assistant text was generated, push it to the history.
        if (assistantText) {
          conversation.push({ role: "assistant", content: assistantText });
        }
        if (this.currentChatId === id) {
          if (this.activeController === controller) {
            await this.persistChat(id, createdAt, conversation, modelName);
          }
          this.view?.webview.postMessage({ type: "vsc:assistantDone" });
        }
      }
    } finally {
      if (this.activeController === controller)
        this.activeController = undefined;
    }
  }

  /** Opens the attachment picker and refreshes the webview's attachment list. */
  private async pickAttachments(): Promise<void> {
    await this.attachments.pick();
    this.postAttachments();
  }

  /** Sends the current attachment names to the webview. */
  private postAttachments(): void {
    const activeDocument = this.attachments.activeDocumentAttachment();
    this.view?.webview.postMessage({
      type: "vsc:attachments",
      attached: this.attachments.allBase,
      activeDocument: activeDocument,
    });
  }

  /** Renders the webview shell with a generated Content Security Policy nonce. */
  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce(); // Generate a unique nonce for Content-Security-Policy
    const cspSource = webview.cspSource;
    const scriptUri = this.resources
      .getWebViewAsset("chat.js")
      .asWebUri(webview)
      .toString();
    const styleUri = this.resources
      .getWebViewAsset("style.css")
      .asWebUri(webview)
      .toString();
    const iconUri = (name: string) =>
      this.resources.getIcon(name).asWebUri(webview).toString();
    return shellHtml(cspSource, nonce, scriptUri, styleUri, iconUri);
  }
}

/**
 * Generates a random nonce string.
 * @returns A randomly generated nonce string used for Content-Security-Policy.
 */
function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
