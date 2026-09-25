import { getGoodBuddyConfig } from "@/config";
import { ChatMessage, GoodBuddyProvider } from "@/provider";
import { marked } from "marked";
import * as vscode from "vscode";
import { AttachmentStore } from "./AttachmentStore";
import { ChatAgent } from "./ChatAgent";
import { WriteApprovalManager } from "./WriteApprovalManager";
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
  private readonly workspaceTools = new WorkspaceTools();
  private readonly attachments = new AttachmentStore();
  private readonly writeApprovals: WriteApprovalManager;
  private readonly tools: ToolRegistry;
  private readonly agent: ChatAgent;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly provider: GoodBuddyProvider,
  ) {
    this.writeApprovals = new WriteApprovalManager(this.workspaceTools, {
      // Handle write proposals from the workspace tools.
      propose: (id, path, diff) =>
        this.view?.webview.postMessage({
          type: "writeProposal",
          id,
          path,
          diff,
        }),
    });
    // Initialize the tool registry and chat agent.
    this.tools = new ToolRegistry(
      this.workspaceTools.createTools((tool) =>
        this.writeApprovals.execute(tool),
      ),
    );
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
            text: `Using ${tool.tool}…`,
          }),
      },
    );
  }

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
        case "selectModel":
          await this.context.globalState.update(MODEL_STATE_KEY, message.model);
          break;
        case "newChat":
          this.activeController?.abort();
          this.writeApprovals.rejectAll();
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
      }
    });
  }

  private getSelectedModel(): string {
    const { chatModel } = getGoodBuddyConfig();
    return this.context.globalState.get<string>(MODEL_STATE_KEY, chatModel);
  }

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

  private async postHistory(): Promise<void> {
    const messages = await Promise.all(
      this.history.map(async (message) =>
        message.role === "assistant"
          ? { ...message, html: await marked.parse(message.content) }
          : message,
      ),
    );
    this.view?.webview.postMessage({
      type: "history",
      messages,
    });
  }

  private async handleSend(text: string): Promise<void> {
    if ((!text.trim() && this.attachments.all.length === 0) || !this.view) {
      return;
    }

    // Abort any ongoing request before starting a new one.
    this.activeController?.abort();

    const model = this.getSelectedModel();
    const attachmentBlock = this.attachments.formatForPrompt();
    const userContent = `${text}${attachmentBlock}`.trim();
    const attachmentLabel = this.attachments.all.length
      ? `\n\nAttached: ${this.attachments.names().join(", ")}`
      : "";
    this.attachments.clear();
    this.postAttachments();
    this.history.push({ role: "user", content: userContent });
    this.view.webview.postMessage({
      type: "userMessage",
      text: `${text}${attachmentLabel}`.trim(),
    });

    const controller = new AbortController();
    this.activeController = controller;
    let assistantText = "";
    try {
      assistantText = await this.agent.run(
        this.history,
        model,
        controller.signal,
      );
      this.view.webview.postMessage({ type: "assistantStart" });
      this.view.webview.postMessage({
        type: "assistantChunk",
        html: marked.parse(assistantText),
      });
      this.history.push({ role: "assistant", content: assistantText });
      this.view.webview.postMessage({ type: "assistantDone" });
    } catch (err) {
      if (!controller.signal.aborted) {
        this.view.webview.postMessage({
          type: "assistantError",
          text: formatError(err),
        });
      } else {
        if (assistantText) {
          this.history.push({ role: "assistant", content: assistantText });
        }
        this.view.webview.postMessage({ type: "assistantDone" });
      }
    } finally {
      this.activeController = undefined;
    }
  }

  private async pickAttachments(): Promise<void> {
    await this.attachments.pick();
    this.postAttachments();
  }

  private postAttachments(): void {
    this.view?.webview.postMessage({
      type: "attachments",
      names: this.attachments.names(),
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce(); // Generate a unique nonce for Content-Security-Policy
    const cspSource = webview.cspSource;
    return shellHtml(cspSource, nonce);
  }
}

function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
