import { ChatMessage, GoodBuddyProvider } from "@/provider";
import { ModelSelectionStore } from "@/provider/ModelSelectionStore";
import { Resources } from "@/resources";
import { marked } from "marked";
import * as path from "node:path";
import * as vscode from "vscode";
import { ChatAgent } from "./agent";
import {
  CommandApprovalManager,
  WriteApprovalManager,
} from "./approval-managers";
import { ChatSession } from "./ChatSession";
import { ChatViewState } from "./ChatViewState";
import { ChatWebviewMessageRouter } from "./ChatWebviewMessageRouter";
import { ProposalDiffEditor } from "./ProposalDiffEditor";
import { shellHtml } from "./shell";
import { ChatHistoryStore } from "./storage/ChatHistoryStore";
import { ToolRegistry } from "./tools";
import { WorkspaceTools } from "./tools/WorkspaceTools";
import { findRetryUserIndex, formatError } from "./utils";

export class ChatFeature implements vscode.WebviewViewProvider {
  public static readonly viewType = "goodBuddy.chatView";

  private view?: vscode.WebviewView;
  private activeController?: AbortController;
  private reviewingChanges = false;
  private readonly resources: Resources;
  private readonly session: ChatSession;
  private readonly viewState: ChatViewState;
  private readonly proposalDiffEditor: ProposalDiffEditor;
  private readonly workspaceTools = new WorkspaceTools();
  private readonly writeApprovals: WriteApprovalManager;
  private readonly commandApprovals: CommandApprovalManager;
  private readonly tools: ToolRegistry;
  private readonly agent: ChatAgent;

  /** Initializes chat tools, approval managers, and the chat agent. */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    readonly provider: GoodBuddyProvider,
    readonly modelSelections: ModelSelectionStore,
  ) {
    this.resources = new Resources(context);

    this.viewState = new ChatViewState(
      context,
      provider,
      modelSelections,
      this.resources,
      output,
      () => this.view?.webview,
    );

    this.session = new ChatSession(
      new ChatHistoryStore(context.globalStorageUri),
      output,
      () => this.viewState.getSelectedModel(),
      () => this.postChatList(),
    );

    // Initialize the proposal diff editor.
    this.proposalDiffEditor = new ProposalDiffEditor();
    context.subscriptions.push(this.proposalDiffEditor);

    // Initialize the write approval manager.
    this.writeApprovals = new WriteApprovalManager(this.workspaceTools, {
      // Handle write proposals from the workspace tools.
      propose: (id, path, diff, before, after) => {
        this.view?.webview.postMessage({
          type: "vsc:writeProposal",
          id,
          path,
          diff,
        });
        void this.proposalDiffEditor
          .open(id, path, before, after)
          .catch((error: unknown) => {
            const message = formatError(error);
            this.output.appendLine(
              `[proposal diff error] Could not open ${path}: ${message}`,
            );
            void vscode.window.showErrorMessage(
              `Could not open the proposed change in a diff editor: ${message}`,
            );
          });
      },
      complete: (id, result) => {
        this.view?.webview.postMessage({
          type: "vsc:writeComplete",
          id,
          result,
        });
        this.proposalDiffEditor.complete(id);
      },
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

    const router = new ChatWebviewMessageRouter(webviewView.webview, {
      ready: async () => {
        await this.viewState.sendModelList();
        this.postHistory();
        this.viewState.postAttachments();
        await this.postChatList();
      },
      checkProvider: () => this.viewState.sendModelList(),
      openSettings: async () => {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:dabanli.good-buddy",
        );
      },
      openFile: (filePath) => this.openFileInVsCode(filePath),
      send: (text) => this.handleSend(text),
      reviewChanges: () => this.handleGitReview(),
      retry: (historyIndex) => this.handleRetry(historyIndex),
      attachFiles: () => this.viewState.pickAttachments(),
      attachSelection: () => this.viewState.attachSelection(),
      excludeActiveDocument: () => this.viewState.excludeActiveDocument(),
      addImage: (name, mimeType, data) =>
        this.viewState.addImageAttachment(name, mimeType, data),
      removeAttachment: (index) => {
        this.viewState.attachments.removeAt(index);
        this.viewState.postAttachments();
      },
      removeImage: (id) => this.viewState.removeImageAttachment(id),
      selectModel: (model) => this.viewState.selectModel(model),
      selectCompletionModel: (model) =>
        this.viewState.selectCompletionModel(model),
      newChat: async () => {
        this.activeController?.abort();
        this.writeApprovals.rejectAll();
        this.commandApprovals.rejectAll();
        await this.saveCurrentChat();
        this.session.clear();
        this.viewState.attachments.clear();
        this.viewState.postAttachments();
        await this.postHistory();
        await this.postChatList();
      },
      listChats: () => this.postChatList(),
      resumeChat: (id) => this.resumeChat(id),
      deleteChat: (id) => this.confirmDeleteChat(id),
      cancel: () => this.activeController?.abort(),
      reviewWrite: (id, approved) => this.writeApprovals.review(id, approved),
      reviewCommand: (id, approved) =>
        this.commandApprovals.executeOrReject(id, approved),
    });
    const messageSubscription = router.register();
    webviewView.onDidDispose(() => messageSubscription.dispose());
  }

  /** Sends chat history to the webview, rendering assistant messages as HTML. */
  private postHistory(thinking = false) {
    const messages = this.session.history.map(
      (
        { role, content, displayContent, suggestions, files },
        historyIndex,
      ) => ({
        role,
        content: marked.parse(displayContent ?? content),
        suggestions,
        files,
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
        chats: await this.session.list(),
      });
    } catch (err) {
      this.output.appendLine(
        `Good Buddy chat: failed to list saved chats: ${err}`,
      );
    }
  }

  private async saveCurrentChat(): Promise<void> {
    await this.session.saveCurrent();
  }

  private async resumeChat(id: string): Promise<void> {
    let chat: Awaited<ReturnType<ChatSession["get"]>>;
    try {
      chat = await this.session.get(id);
    } catch (error) {
      const message = formatError(error);
      this.output.appendLine(`Good Buddy chat: failed to resume chat: ${message}`);
      void vscode.window.showErrorMessage(
        `Good Buddy could not restore the conversation and its attachments: ${message}`,
      );
      return;
    }
    if (!chat) return;

    this.activeController?.abort();
    this.writeApprovals.rejectAll();
    this.commandApprovals.rejectAll();
    this.session.setCurrent(chat);
    this.viewState.attachments.clear();
    await this.viewState.selectModel(chat.model);
    this.viewState.postAttachments();
    this.postHistory();
    await this.postChatList();
  }

  private async confirmDeleteChat(id: string): Promise<void> {
    const chat = await this.session.get(id);
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
    if (!(await this.session.delete(id))) return;

    if (id === this.session.currentId) {
      this.activeController?.abort();
      this.writeApprovals.rejectAll();
      this.commandApprovals.rejectAll();
      this.session.clear();
      this.viewState.postAttachments();
      await this.postHistory();
    }

    await this.postChatList();
  }

  private async handleRetry(assistantIndex: number): Promise<void> {
    if (this.activeController) return;

    const userIndex = findRetryUserIndex(this.session.history, assistantIndex);
    if (userIndex === undefined) return;

    const userMessage = this.session.history[userIndex];
    this.session.history = this.session.history.slice(0, userIndex);
    this.postHistory(true);
    await this.handleSend(userMessage.content, userMessage);
  }

  private async handleGitReview(): Promise<void> {
    if (this.activeController || this.reviewingChanges || !this.view) return;
    this.reviewingChanges = true;
    try {
      const changes = await this.workspaceTools.getGitChanges();
      if (!changes) {
        void vscode.window.showInformationMessage(
          "Good Buddy: there are no staged, unstaged, or untracked changes to review.",
        );
        return;
      }
      await this.handleSend(
        "Review my current Git changes. Focus on concrete, actionable findings.\n\n" +
          changes,
        undefined,
        {
          includeActiveDocument: false,
          includeAttachments: false,
          clearAttachments: false,
          displayContent: "Review my current Git changes.",
        },
      );
    } catch (error) {
      const message = formatError(error);
      this.output.appendLine(`[git review error] ${message}`);
      void vscode.window.showErrorMessage(
        `Good Buddy could not collect Git changes: ${message}`,
      );
    } finally {
      this.reviewingChanges = false;
      this.view?.webview.postMessage({
        type: "vsc:modelStatus",
        waiting: false,
      });
    }
  }

  private async openFileInVsCode(filePath: string): Promise<void> {
    try {
      const requestedPath = filePath.trim();
      if (!requestedPath) throw new Error("The file path is empty.");

      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      if (workspaceFolders.length === 0) {
        throw new Error("Open a workspace folder before opening a file.");
      }

      let absolutePath: string | undefined;
      if (!path.isAbsolute(requestedPath)) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        absolutePath = path.resolve(workspaceRoot, requestedPath);
        const relative = path.relative(workspaceRoot, absolutePath);
        if (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          throw new Error("The file path must stay inside the workspace.");
        }
      }

      if (absolutePath) {
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.file(absolutePath),
        );
        await vscode.window.showTextDocument(document, { preview: false });
      }
    } catch (error) {
      const message = formatError(error);
      this.output.appendLine(
        `[open file error] Could not open ${filePath}: ${message}`,
      );
      void vscode.window.showErrorMessage(
        `Could not open workspace file: ${message}`,
      );
    }
  }

  /** Adds a user message and runs the agent, reporting its result to the webview. */
  private async handleSend(
    userMessage: string,
    replayMessage?: ChatMessage,
    options: {
      includeActiveDocument?: boolean;
      includeAttachments?: boolean;
      clearAttachments?: boolean;
      displayContent?: string;
    } = {},
  ): Promise<void> {
    // Return early if a new message is empty and has no attachments, or the webview is unavailable.
    if (
      (!replayMessage &&
        !userMessage.trim() &&
      this.viewState.attachments.all.length === 0 &&
      this.viewState.attachments.images.length === 0) ||
      !this.view
    ) {
      return;
    }

    // Abort any ongoing request before starting a new one.
    this.activeController?.abort();
    this.writeApprovals.rejectAll(
      "Write cancelled because a new chat request was sent.",
    );
    const modelName = this.viewState.getSelectedModel();
    const selectedModel = await this.viewState.modelDetails(modelName);
    const includeAttachments = options.includeAttachments ?? true;
    const activeDocument = replayMessage
      ? undefined
      : options.includeActiveDocument !== false
        ? this.viewState.attachments.activeDocumentAttachment()
        : undefined;
    const attachmentBlock = replayMessage
      ? ""
      : includeAttachments
        ? this.viewState.attachments.formatForPrompt(activeDocument)
        : "";
    const images = replayMessage
      ? replayMessage.images
      : includeAttachments
        ? this.viewState.attachments.images.map(
            ({ name, mimeType, data }) => ({ name, mimeType, data }),
          )
        : undefined;
    const userContent =
      replayMessage?.content ?? `${userMessage}${attachmentBlock}`.trim();
    const attachedNames = replayMessage
      ? []
      : [
          ...(includeAttachments
            ? this.viewState.attachments.names(activeDocument)
            : []),
          ...(includeAttachments
            ? this.viewState.attachments.images.map(({ name }) => name)
            : []),
        ];
    const attachmentLabel = replayMessage
      ? ""
      : attachedNames.length
        ? `\n\n>Attached: ${attachedNames.join(", ")}`
        : activeDocument
          ? `\n\n>Open file: ${activeDocument.name}`
          : "";
    const displayContent =
      replayMessage?.displayContent ??
      options.displayContent ??
      `${userMessage}${attachmentLabel}`.trim();
    if (!replayMessage && options.clearAttachments !== false) {
      this.viewState.attachments.clear();
      this.viewState.postAttachments();
    }
    const conversation = this.session.history;
    const { id, createdAt } = this.session.ensureCurrent();
    conversation.push({
      role: "user",
      content: userContent,
      displayContent,
      ...(images?.length && { images }),
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
      if (controller.signal.aborted || this.session.currentId !== id) return;

      // Run the agent to generate the assistant's response.
      const result = await this.agent.run(
        conversation,
        selectedModel,
        controller.signal,
        replayMessage !== undefined,
      );
      assistantText = result.response;
      const chatTitle = result.title ?? this.session.currentTitle;
      if (this.session.currentId === id && result.title) {
        this.session.currentTitle = result.title;
      }
      if (controller.signal.aborted || this.session.currentId !== id) {
        if (assistantText) {
          conversation.push({ role: "assistant", content: assistantText });
          await this.session.persist(
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
        files: result.files,
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
        files: result.files,
      });
      void this.session.persist(
        id,
        createdAt,
        conversation,
        modelName,
        chatTitle,
      );
    } catch (err) {
      // If an error occurs and the request was not aborted, notify the webview of the error.
      if (!controller.signal.aborted) {
        if (this.session.currentId === id) {
          const imageHint = images?.length
            ? " The selected model or server may not support image input; try a vision-capable chat model."
            : "";
          this.view?.webview.postMessage({
            type: "vsc:assistantError",
            text: `${formatError(err)}${imageHint}`,
          });
          await this.session.persist(id, createdAt, conversation, modelName);
        }
      } else {
        // If the request was aborted, but some assistant text was generated, push it to the history.
        if (assistantText) {
          conversation.push({ role: "assistant", content: assistantText });
        }
        if (this.session.currentId === id) {
          if (this.activeController === controller) {
            await this.session.persist(id, createdAt, conversation, modelName);
          }
          this.view?.webview.postMessage({ type: "vsc:assistantDone" });
        }
      }
    } finally {
      if (this.activeController === controller)
        this.activeController = undefined;
    }
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
