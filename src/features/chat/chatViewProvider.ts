import * as vscode from "vscode";
import { getGoodBuddyConfig } from "../../config";
import { ChatMessage, OllamaClient } from "../../ollama";
import { ToolCall, WorkspaceTools } from "./workspaceTools";

const MODEL_STATE_KEY = "goodBuddy.selectedChatModel";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 80_000;

interface ChatAttachment {
  name: string;
  content: string;
}

export class GoodBuddyChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "goodBuddy.chatView";

  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private activeController?: AbortController;
  private readonly workspaceTools = new WorkspaceTools();
  private readonly pendingWrites = new Map<string, { path: string; before: string; after: string; resolve: (result: string) => void }>();
  private nextWriteId = 1;
  private attachments: ChatAttachment[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

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
          this.rejectPendingWrites();
          this.history = [];
          this.attachments = [];
          this.postAttachments();
          this.postHistory();
          break;
        case "cancel":
          this.activeController?.abort();
          break;
        case "reviewWrite":
          await this.reviewWrite(String(message.id ?? ""), Boolean(message.approved));
          break;
      }
    });
  }

  private getSelectedModel(): string {
    const { chatModel } = getGoodBuddyConfig();
    return this.context.globalState.get<string>(MODEL_STATE_KEY, chatModel);
  }

  private async sendModelList(): Promise<void> {
    const { endpoint, chatModel } = getGoodBuddyConfig();
    const client = new OllamaClient(endpoint);
    try {
      const models = await client.listModels();
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
    if ((!text.trim() && this.attachments.length === 0) || !this.view) {
      return;
    }

    // Only one response can be active. A second send supersedes the first.
    this.activeController?.abort();

    const { endpoint } = getGoodBuddyConfig();
    const model = this.getSelectedModel();
    const client = new OllamaClient(endpoint);

    const attachmentBlock = this.attachments
      .map((attachment) => `\n\nAttached file: ${attachment.name}\n\`\`\`\n${attachment.content}\n\`\`\``)
      .join("");
    const userContent = `${text}${attachmentBlock}`.trim();
    const attachmentLabel = this.attachments.length
      ? `\n\nAttached: ${this.attachments.map((attachment) => attachment.name).join(", ")}`
      : "";
    this.attachments = [];
    this.postAttachments();
    this.history.push({ role: "user", content: userContent });
    this.view.webview.postMessage({ type: "userMessage", text: `${text}${attachmentLabel}`.trim() });

    const controller = new AbortController();
    this.activeController = controller;

    let assistantText = "";
    try {
      assistantText = await this.runAgent(client, model, controller.signal);
      this.view.webview.postMessage({ type: "assistantStart" });
      this.view.webview.postMessage({ type: "assistantChunk", text: assistantText });
      this.history.push({ role: "assistant", content: assistantText });
      this.view.webview.postMessage({ type: "assistantDone" });
    } catch (err) {
      if (!controller.signal.aborted) {
        this.view.webview.postMessage({
          type: "assistantError",
        text: formatError(err),
        });
      } else {
        // Cancelled mid-stream; keep whatever was generated so far.
        if (assistantText) {
          this.history.push({ role: "assistant", content: assistantText });
        }
        this.view.webview.postMessage({ type: "assistantDone" });
      }
    } finally {
      this.activeController = undefined;
    }
  }

  private async runAgent(client: OllamaClient, model: string, signal: AbortSignal): Promise<string> {
    const messages: ChatMessage[] = [agentInstructions(await this.workspaceTools.projectContext()), ...this.history];
    for (let step = 0; step < 6; step++) {
      const response = await client.chat({ model, messages }, signal);
      this.output.appendLine(`[agent response] ${response.slice(0, 2_000)}`);
      const toolCall = parseToolCall(response);
      if (!toolCall) {
        if (step === 0 && needsWorkspaceTool(this.history.at(-1)?.content ?? "")) {
          messages.push({ role: "assistant", content: response });
          messages.push({ role: "user", content: "Do not describe the next step. Submit the required tool JSON now, with no prose." });
          continue;
        }
        return response;
      }

      this.view?.webview.postMessage({ type: "toolStatus", text: `Using ${toolCall.tool}…` });
      let result: string;
      try {
        result = await this.executeTool(toolCall);
      } catch (error) {
        result = `Tool error: ${formatError(error)}`;
      }
      messages.push({ role: "assistant", content: response });
      messages.push({ role: "user", content: `Tool result for ${toolCall.tool}:\n${result}\nNow answer the original request.` });
    }
    return "I stopped after five tool calls. Please narrow the request and try again.";
  }

  private async executeTool(toolCall: ToolCall): Promise<string> {
    if (toolCall.tool !== "write_file" && toolCall.tool !== "replace_in_file") return this.workspaceTools.run(toolCall);
    const path = toolArgument(toolCall, "path");
    const edit = toolCall.tool === "replace_in_file"
      ? await this.workspaceTools.proposeReplacement(path, toolArgument(toolCall, "oldText"), toolArgument(toolCall, "newText"))
      : (() => undefined)();
    const before = edit?.before ?? await this.workspaceTools.currentContent(path);
    const content = edit?.after ?? toolArgument(toolCall, "content");
    const proposal = edit?.proposal ?? await this.workspaceTools.proposeWrite(path, content);
    const id = String(this.nextWriteId++);
    this.view?.webview.postMessage({ type: "writeProposal", id, path: proposal.path, diff: proposal.diff });
    return new Promise((resolve) => this.pendingWrites.set(id, { path, before, after: content, resolve }));
  }

  private async reviewWrite(id: string, approved: boolean): Promise<void> {
    const pending = this.pendingWrites.get(id);
    if (!pending) return;
    this.pendingWrites.delete(id);
    if (!approved) return pending.resolve("Write denied by the user.");
    try {
      pending.resolve(await this.workspaceTools.applyWrite(pending.path, pending.before, pending.after));
    } catch (error) {
      pending.resolve(`Tool error: ${formatError(error)}`);
    }
  }

  private rejectPendingWrites(): void {
    for (const pending of this.pendingWrites.values()) pending.resolve("Write denied because the chat was reset.");
    this.pendingWrites.clear();
  }

  private async pickAttachments(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: "Attach to Good Buddy chat",
    });
    if (!selected) return;
    const room = MAX_ATTACHMENTS - this.attachments.length;
    for (const uri of selected.slice(0, room)) {
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.length > MAX_ATTACHMENT_BYTES || bytes.includes(0)) {
        vscode.window.showWarningMessage(`Good Buddy skipped ${uri.path.split("/").pop()}: attachments must be text files under 80 KB.`);
        continue;
      }
      this.attachments.push({ name: uri.path.split("/").pop() ?? "file", content: Buffer.from(bytes).toString("utf8") });
    }
    this.postAttachments();
  }

  private postAttachments(): void {
    this.view?.webview.postMessage({ type: "attachments", names: this.attachments.map((attachment) => attachment.name) });
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function agentInstructions(projectContext: string): ChatMessage {
  return {
    role: "system",
    content: `You are Good Buddy, a concise coding assistant with workspace tools.
Use a tool only when it helps answer the user's request. To request one, reply with ONLY this JSON object (no Markdown):
{"tool":"list_project","arguments":{}}
{"tool":"read_file","arguments":{"path":"relative/path"}}
{"tool":"write_file","arguments":{"path":"relative/path","content":"complete file contents"}}
{"tool":"replace_in_file","arguments":{"path":"relative/path","oldText":"exact existing text","newText":"replacement text"}}
{"tool":"run_command","arguments":{"command":"npm test"}}
Current project context:\n${projectContext}\n\nWhen the user asks about or changes this project, inspect relevant files before answering. Do not stop after saying what you will do: request the next tool in the same response. For small edits, prefer replace_in_file. The user must approve every write and command. Paths must be relative to the workspace. After a tool result, either request another tool or give the final answer.`,
  };
}

function parseToolCall(response: string): ToolCall | undefined {
  for (const json of jsonCandidates(response)) {
    try {
      const candidate = JSON.parse(json) as Partial<ToolCall>;
      if (
        candidate &&
        typeof candidate === "object" &&
        ["list_project", "read_file", "write_file", "replace_in_file", "run_command"].includes(candidate.tool ?? "") &&
        candidate.arguments &&
        typeof candidate.arguments === "object" &&
        !Array.isArray(candidate.arguments)
      ) {
        return candidate as ToolCall;
      }
    } catch {
      // Keep looking: local models often wrap a valid request in prose or a code fence.
    }
  }
  return undefined;
}

function jsonCandidates(response: string): string[] {
  const candidates = [response.trim()];
  const tagged = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i.exec(response)?.[1];
  if (tagged) candidates.push(tagged);
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(response)?.[1];
  if (fenced) candidates.push(fenced);

  const start = response.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < response.length; index++) {
      const char = response[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}" && --depth === 0) {
        candidates.push(response.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates;
}

function toolArgument(toolCall: ToolCall, name: string): string {
  const value = toolCall.arguments[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Tool argument '${name}' must be a non-empty string.`);
  }
  return value;
}

function needsWorkspaceTool(userRequest: string): boolean {
  return /\b(project|workspace|file|folder|directory|codebase|repo|read|inspect|check|test|run|edit|change|modify|add|remove|fix|implement|write)\b/i.test(userRequest);
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
