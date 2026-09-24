import { getGoodBuddyConfig } from "@/config";
import { ChatMessage, GoodBuddyProvider } from "@/provider";
import * as vscode from "vscode";
import { AttachmentStore } from "./AttachmentStore";
import { ChatAgent } from "./ChatAgent";
import { WriteApprovalManager } from "./WriteApprovalManager";
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
      propose: (id, path, diff) =>
        this.view?.webview.postMessage({
          type: "writeProposal",
          id,
          path,
          diff,
        }),
    });
    this.tools = new ToolRegistry(
      this.workspaceTools.createTools((tool) =>
        this.writeApprovals.execute(tool),
      ),
    );
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

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "ready":
          await this.sendModelList();
          this.postHistory();
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
          this.postHistory();
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

  private postHistory(): void {
    this.view?.webview.postMessage({
      type: "history",
      messages: this.history,
    });
  }

  private async handleSend(text: string): Promise<void> {
    if ((!text.trim() && this.attachments.all.length === 0) || !this.view) {
      return;
    }
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
        text: assistantText,
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
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { height: 100%; }
  body { font-family: var(--vscode-font-family); padding: 0; margin: 0; display: flex; flex-direction: column; color: var(--vscode-foreground); }
  header { display: flex; gap: 6px; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  select, button { font-family: inherit; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 4px; padding: 2px 6px; }
  select { flex: 1; min-width: 0; }
  #messages { flex: 1; overflow-y: auto; padding: 8px; }
  .msg { margin-bottom: 12px; white-space: pre-wrap; line-height: 1.4; }
  .msg .role { font-weight: 600; font-size: 0.85em; opacity: 0.7; margin-bottom: 2px; }
  .msg.user .role { color: var(--vscode-textLink-foreground); }
  .msg.assistant .role { color: var(--vscode-charts-green); }
  .msg.error .role { color: var(--vscode-errorForeground); }
  .proposal { margin: 8px 0 12px; padding: 8px; border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; }
  .proposal pre { max-height: 260px; overflow: auto; white-space: pre; background: var(--vscode-textCodeBlock-background); padding: 6px; }
  .proposal-actions { display: flex; gap: 6px; }
  footer { display: flex; gap: 6px; padding: 6px; border-top: 1px solid var(--vscode-panel-border); flex-wrap: wrap; }
  textarea { flex: 1; resize: none; font-family: inherit; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 4px; }
  #attachments { width: 100%; font-size: 0.85em; opacity: 0.8; }
</style>
</head>
<body>
  <header>
    <select id="modelSelect"></select>
    <button id="newChatBtn" title="New chat">New</button>
  </header>
  <div id="messages"></div>
  <footer>
    <textarea id="input" rows="2" placeholder="Ask Good Buddy... (Enter to send, Shift+Enter for newline)"></textarea>
    <button id="attachBtn" title="Attach text files">Attach</button>
    <button id="sendBtn">Send</button>
    <div id="attachments"></div>
  </footer>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById('messages');
  const modelSelect = document.getElementById('modelSelect');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const attachBtn = document.getElementById('attachBtn');
  const attachmentsEl = document.getElementById('attachments');

  let assistantBodyEl = null;

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const roleLabel = document.createElement('div');
    roleLabel.className = 'role';
    roleLabel.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'Good Buddy' : 'Error';
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = text;
    div.appendChild(roleLabel);
    div.appendChild(body);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return body;
  }

  function send() {
    const text = input.value;
    if (!text.trim()) return;
    input.value = '';
    vscode.postMessage({ type: 'send', text });
  }

  function addWriteProposal(id, path, diff) {
    const card = document.createElement('section');
    card.className = 'proposal';
    const title = document.createElement('strong');
    title.textContent = 'Proposed change: ' + path;
    const patch = document.createElement('pre');
    patch.textContent = diff;
    const actions = document.createElement('div');
    actions.className = 'proposal-actions';
    for (const approved of [true, false]) {
      const button = document.createElement('button');
      button.textContent = approved ? 'Approve' : 'Reject';
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'reviewWrite', id, approved });
        actions.textContent = approved ? 'Approved' : 'Rejected';
      });
      actions.appendChild(button);
    }
    card.append(title, patch, actions);
    messagesEl.appendChild(card);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  newChatBtn.addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));
  attachBtn.addEventListener('click', () => vscode.postMessage({ type: 'attachFiles' }));
  modelSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'selectModel', model: modelSelect.value });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'models': {
        modelSelect.innerHTML = '';
        for (const m of msg.models) {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          if (m === msg.selected) opt.selected = true;
          modelSelect.appendChild(opt);
        }
        break;
      }
      case 'history': {
        messagesEl.innerHTML = '';
        for (const m of msg.messages) {
          addMessage(m.role, m.content);
        }
        break;
      }
      case 'userMessage':
        addMessage('user', msg.text);
        break;
      case 'assistantStart':
        assistantBodyEl = addMessage('assistant', '');
        break;
      case 'assistantChunk':
        if (assistantBodyEl) {
          assistantBodyEl.textContent += msg.text;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        break;
      case 'assistantDone':
        assistantBodyEl = null;
        break;
      case 'assistantError':
        addMessage('error', msg.text);
        assistantBodyEl = null;
        break;
      case 'toolStatus':
        addMessage('assistant', msg.text);
        break;
      case 'writeProposal':
        addWriteProposal(msg.id, msg.path, msg.diff);
        break;
      case 'attachments':
        attachmentsEl.textContent = msg.names.length ? 'Attached: ' + msg.names.join(', ') : '';
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
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
