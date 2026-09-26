import { getGoodBuddyConfig } from "@/config";
import { ChatMessage, GoodBuddyProvider } from "@/provider";
import { Resources } from "@/resources";
import { marked } from "marked";
import * as vscode from "vscode";
import { ChatAgent } from "./agent";
import {
  CommandApprovalManager,
  WriteApprovalManager,
} from "./approval-managers";
import { AttachmentStore } from "./attachment";
import { shellHtml } from "./shell";
import { ToolRegistry } from "./tools";
import { WorkspaceTools } from "./tools/WorkspaceTools";
import { formatError } from "./utils";

const MODEL_STATE_KEY = "goodBuddy.selectedChatModel";

export class GoodBuddyChatFeature implements vscode.WebviewViewProvider {
  public static readonly viewType = "goodBuddy.chatView";

  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private activeController?: AbortController;
  private readonly resources: Resources;
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
    this.writeApprovals = new WriteApprovalManager(this.workspaceTools, {
      // Handle write proposals from the workspace tools.
      propose: (id, path, diff) =>
        this.view?.webview.postMessage({
          type: "writeProposal",
          id,
          path,
          diff,
        }),
      complete: (id, result) =>
        this.view?.webview.postMessage({
          type: "writeComplete",
          id,
          result,
        }),
    });

    // Initialize the command approval manager.
    this.commandApprovals = new CommandApprovalManager(this.workspaceTools, {
      propose: (id, command) =>
        this.view?.webview.postMessage({
          type: "commandProposal",
          id,
          command,
        }),
      start: (id, command) =>
        this.view?.webview.postMessage({
          type: "commandStart",
          id,
          command,
        }),
      output: (id, text) =>
        this.view?.webview.postMessage({
          type: "commandOutput",
          id,
          text,
        }),
      complete: (id, result) =>
        this.view?.webview.postMessage({
          type: "commandComplete",
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
            type: "toolStatus",
            tool,
          }),
        onModelStatus: (waiting, signal) => {
          if (this.activeController?.signal !== signal) return;
          this.view?.webview.postMessage({ type: "modelStatus", waiting });
        },
      },
    );

    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.postAttachments()),
    );
  }

  /** Configures the chat webview and handles messages sent by its UI. */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    // Handle incoming messages from the webview.
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "ready":
          await this.sendModelList();
          await this.postHistory();
          this.postAttachments();
          break;
        case "send":
          await this.handleSend(String(message.text ?? ""));
          break;
        case "attachFiles":
          await this.pickAttachments();
          break;
        case "removeAttachment":
          this.attachments.removeAt(Number(message.index));
          this.postAttachments();
          break;
        case "selectModel":
          await this.context.globalState.update(MODEL_STATE_KEY, message.model);
          break;
        case "newChat":
          this.activeController?.abort();
          this.writeApprovals.rejectAll();
          this.commandApprovals.rejectAll();
          this.history = [];
          this.attachments.clear();
          this.postAttachments();
          await this.postHistory();
          break;
        case "cancel":
          this.activeController?.abort();
          break;
        case "reviewWrite":
          await this.writeApprovals.review(
            String(message.id ?? ""),
            Boolean(message.approved),
          );
          break;
        case "reviewCommand":
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
    const { chatModel } = getGoodBuddyConfig();
    try {
      const models = await this.provider.listModels();
      this.view?.webview.postMessage({
        type: "models",
        models,
        selected: this.getSelectedModel(),
      });
    } catch (err) {
      this.output.appendLine(`Good Buddy chat: failed to list models: ${err}`);
      this.view?.webview.postMessage({
        type: "models",
        models: [chatModel],
        selected: this.getSelectedModel(),
      });
    }
  }

  /** Sends chat history to the webview, rendering assistant messages as HTML. */
  private async postHistory(): Promise<void> {
    const messages = await Promise.all(
      this.history.map(async ({ role, content, displayContent }) => {
        // Use displayContent if available, otherwise fall back to content.
        const visibleMessage = { role, content: displayContent ?? content };
        // Render the assistant's message as HTML if it is an assistant message.
        return role === "assistant"
          ? { ...visibleMessage, html: await marked.parse(content) }
          : visibleMessage; 
      }),
    );
    this.view?.webview.postMessage({
      type: "history",
      messages,
    });
  }

  /** Adds a user message and runs the agent, reporting its result to the webview. */
  private async handleSend(text: string): Promise<void> {
    // Return early if the message is empty and there are no attachments, or if the webview is not available.
    if ((!text.trim() && this.attachments.all.length === 0) || !this.view) {
      return;
    }

    // Abort any ongoing request before starting a new one.
    this.activeController?.abort();
    this.writeApprovals.rejectAll(
      "Write cancelled because a new chat request was sent.",
    );

    const model = this.getSelectedModel();
    const activeDocument = this.attachments.activeDocumentAttachment();
    const attachmentBlock = this.attachments.formatForPrompt(activeDocument);
    const userContent = `${text}${attachmentBlock}`.trim();
    const attachmentLabel = this.attachments.all.length
      ? `\n\nAttached: ${this.attachments.names(activeDocument).join(", ")}`
      : activeDocument
        ? `\n\nOpen file: ${activeDocument.name}`
        : "";
    const displayContent = `${text}${attachmentLabel}`.trim();
    this.attachments.clear();
    this.postAttachments();
    this.history.push({
      role: "user",
      content: userContent,
      displayContent,
    });
    this.view.webview.postMessage({
      type: "userMessage",
      text: displayContent,
    });

    // Prepare to run the agent and generate the assistant's response.
    const controller = new AbortController();
    this.activeController = controller;

    let assistantText = "";
    try {
      // Run the agent to generate the assistant's response.
      assistantText = await this.agent.run(
        this.history,
        model,
        controller.signal,
      );
      // Notify the webview that the assistant has started generating its response.
      this.view.webview.postMessage({ type: "assistantStart" });
      // Send the initial chunk of the assistant's response to the webview.
      this.view.webview.postMessage({
        type: "assistantChunk",
        html: marked.parse(assistantText),
      });
      // Push the assistant's response to the history.
      this.history.push({ role: "assistant", content: assistantText });
      // Notify the webview that the assistant has finished generating its response.
      this.view.webview.postMessage({ type: "assistantDone" });
    } catch (err) {
      // If an error occurs and the request was not aborted, notify the webview of the error.
      if (!controller.signal.aborted) {
        this.view.webview.postMessage({
          type: "assistantError",
          text: formatError(err),
        });
      } else {
        // If the request was aborted, but some assistant text was generated, push it to the history.
        if (assistantText) {
          this.history.push({ role: "assistant", content: assistantText });
        }
        this.view.webview.postMessage({ type: "assistantDone" });
      }
    } finally {
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
      type: "attachments",
      names: this.attachments.names(),
      activeDocument: activeDocument?.name,
    });
  }

  /** Renders the webview shell with a generated Content Security Policy nonce. */
  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce(); // Generate a unique nonce for Content-Security-Policy
    const cspSource = webview.cspSource;
    const addIconUri = this.resources
      .getIcon("add")
      .asWebUri(webview)
      .toString();
    const sendIconUri = this.resources
      .getIcon("send")
      .asWebUri(webview)
      .toString();
    return shellHtml(cspSource, nonce, addIconUri, sendIconUri);
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
