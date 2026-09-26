// Auto-generated from D:\Code\good-buddy\scripts\html\chat-shell.html

export const shellHtml = (cspSource: string, nonce: string, addIconUri: string, sendIconUri: string) => `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <style>
      html,
      body {
        height: 100%;
      }
      body {
        font-family: var(--vscode-font-family);
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
      }
      header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
      }
      select,
      button {
        font-family: inherit;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        border-radius: 4px;
        padding: 4px 8px;
      }
      button {
        cursor: pointer;
      }
      button:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }
      select {
        flex: 1;
        min-width: 0;
      }
      #messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px 14px 24px;
      }
      .msg {
        margin: 0 auto 22px;
        max-width: 900px;
        white-space: pre-wrap;
        line-height: 1.55;
      }
      .msg .role {
        font-weight: 600;
        font-size: 0.9em;
        margin-bottom: 7px;
        letter-spacing: 0.01em;
      }
      .msg.user .role {
        color: var(--vscode-foreground);
      }
      .msg.assistant .role {
        color: var(--vscode-textLink-foreground);
      }
      .msg.error .role {
        color: var(--vscode-errorForeground);
      }
      .msg.user .body {
        display: inline-block;
        max-width: min(85%, 720px);
        padding: 8px 11px;
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 6px;
        background: var(--vscode-editor-background);
      }
      .msg.assistant .body {
        max-width: 100%;
      }
      .tool-status {
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 900px;
        margin: -6px auto 16px;
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
      }
      .tool-status::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--vscode-charts-blue);
        flex: 0 0 auto;
      }
      .markdown {
        white-space: normal;
        line-height: 1.55;
      }
      .markdown p {
        margin: 0 0 12px;
      }
      .markdown p:last-child {
        margin-bottom: 0;
      }
      .markdown h1,
      .markdown h2,
      .markdown h3,
      .markdown h4 {
        line-height: 1.3;
        margin: 20px 0 8px;
      }
      .markdown h1 {
        font-size: 1.35em;
      }
      .markdown h2 {
        font-size: 1.2em;
      }
      .markdown h3,
      .markdown h4 {
        font-size: 1.05em;
      }
      .markdown ul,
      .markdown ol {
        margin: 8px 0 14px;
        padding-left: 24px;
      }
      .markdown li {
        margin: 4px 0;
      }
      .markdown code {
        font-family: var(--vscode-editor-font-family);
        font-size: 0.9em;
        color: var(--vscode-textPreformat-foreground);
        background: var(--vscode-textCodeBlock-background);
        padding: 0.15em 0.35em;
        border-radius: 3px;
      }
      .markdown pre {
        margin: 14px 0;
        padding: 12px 14px;
        overflow-x: auto;
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 5px;
        background: var(--vscode-textCodeBlock-background);
        color: var(--vscode-textPreformat-foreground);
        white-space: pre;
      }
      .markdown pre code {
        padding: 0;
        background: transparent;
        color: inherit;
      }
      .markdown blockquote {
        margin: 14px 0;
        padding: 6px 14px;
        border-left: 3px solid var(--vscode-textLink-foreground);
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-textCodeBlock-background);
      }
      .markdown a {
        color: var(--vscode-textLink-foreground);
      }
      .markdown table {
        width: 100%;
        margin: 14px 0;
        border-collapse: collapse;
      }
      .markdown th,
      .markdown td {
        padding: 6px 8px;
        border: 1px solid var(--vscode-editorWidget-border);
        text-align: left;
      }
      .markdown th {
        background: var(--vscode-textCodeBlock-background);
      }
      .proposal {
        margin: 8px 0 12px;
        padding: 8px;
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 4px;
      }
      .proposal pre {
        max-height: 260px;
        overflow: auto;
        white-space: pre;
        background: var(--vscode-textCodeBlock-background);
        padding: 6px;
      }
      .command-proposal {
        max-width: 900px;
        margin: 8px auto 18px;
      }
      .command-proposal pre {
        margin: 10px 0;
      }
      .command-output {
        max-height: 260px;
        overflow: auto;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        font-family: var(--vscode-editor-font-family);
      }
      .proposal-actions {
        display: flex;
        gap: 6px;
      }
      footer {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        border-top: 1px solid var(--vscode-panel-border);
        flex-wrap: wrap;
        background: var(--vscode-editor-background);
        #container {
          background: var(--vscode-input-background);

          border: 1px solid var(--vscode-input-border, transparent);
          border-radius: 6px;
          padding: 7px 9px;
          textarea {
            width: 100%;
            background: transparent;
            color: var(--vscode-input-foreground);
            outline: none;
            resize: none;
            font-family: inherit;
            border: none;
            line-height: 1.4;
          }
          #controls {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
          }
          #controls button {
            display: grid;
            width: 32px;
            height: 32px;
            place-items: center;
            padding: 6px;
          }
          .control-icon {
            width: 16px;
            height: 16px;
            background-color: var(--vscode-icon-foreground, var(--vscode-foreground));
            mask-position: center;
            mask-repeat: no-repeat;
            mask-size: contain;
            -webkit-mask-position: center;
            -webkit-mask-repeat: no-repeat;
            -webkit-mask-size: contain;
          }
          #attachBtn .control-icon {
            mask-image: url("${addIconUri}");
            -webkit-mask-image: url("${addIconUri}");
          }
          #sendBtn .control-icon {
            mask-image: url("${sendIconUri}");
            -webkit-mask-image: url("${sendIconUri}");
          }
        }
      }

      #attachments {
        width: 100%;
        font-size: 0.85em;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .attachment-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        padding: 2px 4px 2px 7px;
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 4px;
        background: var(--vscode-input-background);
      }
      .attachment-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .remove-attachment {
        display: inline-grid;
        width: 18px;
        height: 18px;
        place-items: center;
        flex: 0 0 auto;
        padding: 0;
        border: 0;
        border-radius: 3px;
        background: transparent;
        color: var(--vscode-descriptionForeground);
        font-size: 16px;
        line-height: 1;
      }
      .remove-attachment:hover {
        background: var(--vscode-toolbar-hoverBackground);
        color: var(--vscode-foreground);
      }
    </style>
  </head>
  <body>
    <header>
      <select id="modelSelect"></select>
      <button id="newChatBtn" title="New chat">New</button>
    </header>
    <div id="messages"></div>
    <footer>
      <div id="container">
        <div id="attachments"></div>
        <textarea
          id="input"
          rows="2"
          placeholder="Ask Good Buddy... (Enter to send, Shift+Enter for newline)"
        ></textarea>
        <div id="controls">
          <button id="attachBtn" type="button" title="Attach text files" aria-label="Attach text files">
            <span class="control-icon" aria-hidden="true"></span>
          </button>
          <button id="sendBtn" type="button" title="Send message" aria-label="Send message">
            <span class="control-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </footer>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const messagesEl = document.getElementById("messages");
      const modelSelect = document.getElementById("modelSelect");
      const input = document.getElementById("input");
      const sendBtn = document.getElementById("sendBtn");
      const newChatBtn = document.getElementById("newChatBtn");
      const attachBtn = document.getElementById("attachBtn");
      const attachmentsEl = document.getElementById("attachments");
      const commandCards = new Map();
      const writeCards = new Map();

      let assistantBodyEl = null;
      let thinkingIndicator = null;

      function addMessage(role, text) {
        const div = document.createElement("div");
        div.className = "msg " + role;
        const body = document.createElement("div");
        body.className = "";
        switch (role) {
          case "assistant":
            body.className = "body markdown";
            break;
          case "tool":
            body.className = "tool markdown";
            break;
          default:
            body.className = "body";
        }
        body.textContent = text;
        div.appendChild(body);
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return body;
      }

      function addToolStatus(tool) {
        const status = document.createElement("div");
        status.className = "tool-status";
        if (tool.autoApprove) {
          status.textContent = "Used " + tool.tool + "…";
        } else {
          status.textContent = "Proposed " + tool.tool + "…";
        }
        messagesEl.appendChild(status);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function setModelStatus(waiting) {
        if (waiting && !thinkingIndicator) {
          thinkingIndicator = document.createElement("div");
          thinkingIndicator.className = "tool-status";
          thinkingIndicator.textContent = "Thinking...";
          thinkingIndicator.setAttribute("role", "status");
          messagesEl.appendChild(thinkingIndicator);
        } else if (!waiting && thinkingIndicator) {
          thinkingIndicator.remove();
          thinkingIndicator = null;
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function addMarkdownMessage(role, html) {
        const body = addMessage(role, "");
        body.innerHTML = sanitizeHtml(html);
        return body;
      }

      function sanitizeHtml(html) {
        const template = document.createElement("template");
        template.innerHTML = html;
        template.content
          .querySelectorAll("script, style, iframe, object, embed, form")
          .forEach((node) => node.remove());
        template.content.querySelectorAll("*").forEach((element) => {
          for (const attribute of [...element.attributes]) {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (
              name.startsWith("on") ||
              ((name === "href" || name === "src") &&
                /^javascript:/i.test(value))
            ) {
              element.removeAttribute(attribute.name);
            }
          }
        });
        return template.innerHTML;
      }

      function send() {
        const text = input.value;
        if (!text.trim()) return;
        input.value = "";
        vscode.postMessage({ type: "send", text });
      }

      function addWriteProposal(id, path, diff) {
        const card = document.createElement("section");
        card.className = "proposal";
        const title = document.createElement("strong");
        title.textContent = "Proposed change: " + path;
        const patch = document.createElement("pre");
        patch.textContent = diff;
        const actions = document.createElement("div");
        actions.className = "proposal-actions";
        for (const approved of [true, false]) {
          const button = document.createElement("button");
          button.textContent = approved ? "Approve" : "Reject";
          button.addEventListener("click", () => {
            vscode.postMessage({ type: "reviewWrite", id, approved });
            actions.textContent = approved ? "Applying..." : "Rejecting...";
          });
          actions.appendChild(button);
        }
        card.append(title, patch, actions);
        messagesEl.appendChild(card);
        writeCards.set(id, actions);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function completeWrite(id, result) {
        const actions = writeCards.get(id);
        if (!actions) return;
        if (result === "Write denied by the user.") {
          actions.textContent = "Rejected";
        } else if (result.startsWith("Wrote ")) {
          actions.textContent = "Applied";
        } else {
          actions.textContent = "Not applied: " + result;
        }
        writeCards.delete(id);
      }

      function addCommandProposal(id, command, autoApproved = false) {
        const card = document.createElement("section");
        card.className = "proposal command-proposal";
        const title = document.createElement("strong");
        title.textContent = "Run command";
        const detail = document.createElement("pre");
        detail.textContent = command;
        const output = document.createElement("pre");
        output.className = "command-output";
        output.hidden = true;
        const actions = document.createElement("div");
        actions.className = "proposal-actions";
        if (autoApproved) {
          actions.textContent = "Running command...";
        } else {
          for (const approved of [true, false]) {
            const button = document.createElement("button");
            button.textContent = approved ? "Run" : "Reject";
            button.addEventListener("click", () => {
              vscode.postMessage({ type: "reviewCommand", id, approved });
              actions.textContent = approved
                ? "Running command..."
                : "Rejected";
            });
            actions.appendChild(button);
          }
        }
        card.append(title, detail, output, actions);
        messagesEl.appendChild(card);
        commandCards.set(id, { output, actions });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function appendCommandOutput(id, text) {
        const command = commandCards.get(id);
        if (!command) return;
        command.output.hidden = false;
        command.output.textContent += text;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function completeCommand(id, result) {
        const command = commandCards.get(id);
        if (!command) return;
        if (!command.output.textContent) {
          command.output.textContent = result;
          command.output.hidden = false;
        }
        command.actions.textContent = result.startsWith("Command failed:")
          ? "Command failed"
          : "Completed";
      }

      sendBtn.addEventListener("click", send);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
      newChatBtn.addEventListener("click", () =>
        vscode.postMessage({ type: "newChat" }),
      );
      attachBtn.addEventListener("click", () =>
        vscode.postMessage({ type: "attachFiles" }),
      );
      modelSelect.addEventListener("change", () => {
        vscode.postMessage({ type: "selectModel", model: modelSelect.value });
      });

      window.addEventListener("message", (event) => {
        const msg = event.data;
        switch (msg.type) {
          case "models": {
            modelSelect.innerHTML = "";
            for (const m of msg.models) {
              const opt = document.createElement("option");
              opt.value = m;
              opt.textContent = m;
              if (m === msg.selected) opt.selected = true;
              modelSelect.appendChild(opt);
            }
            break;
          }
          case "history": {
            messagesEl.innerHTML = "";
            commandCards.clear();
            writeCards.clear();
            thinkingIndicator = null;
            for (const m of msg.messages) {
              if (m.role === "assistant" && m.html)
                addMarkdownMessage(m.role, m.html);
              else addMessage(m.role, m.content);
            }
            break;
          }
          case "userMessage":
            addMessage("user", msg.text);
            break;
          case "assistantStart":
            setModelStatus(false);
            assistantBodyEl = addMessage("assistant", "");
            break;
          case "assistantChunk":
            if (assistantBodyEl) {
              assistantBodyEl.innerHTML = sanitizeHtml(msg.html);
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            break;
          case "assistantDone":
            setModelStatus(false);
            assistantBodyEl = null;
            break;
          case "assistantError":
            setModelStatus(false);
            addMessage("error", msg.text);
            assistantBodyEl = null;
            break;
          case "modelStatus":
            setModelStatus(msg.waiting);
            break;
          case "toolStatus":
            addToolStatus(msg.tool);
            break;
          case "writeProposal":
            addWriteProposal(msg.id, msg.path, msg.diff);
            break;
          case "writeComplete":
            completeWrite(msg.id, msg.result);
            break;
          case "commandProposal":
            addCommandProposal(msg.id, msg.command);
            break;
          case "commandStart":
            addCommandProposal(msg.id, msg.command, true);
            break;
          case "commandOutput":
            appendCommandOutput(msg.id, msg.text);
            break;
          case "commandComplete":
            completeCommand(msg.id, msg.result);
            break;
          case "attachments":
            {
              const children = [];
              if (msg.activeDocument) {
                const item = document.createElement("div");
                item.className = "attachment-item";
                const label = document.createElement("span");
                label.className = "attachment-name";
                label.textContent = "Open: " + msg.activeDocument;
                label.title = "Included with your next message";
                item.appendChild(label);
                children.push(item);
              }
              for (const [index, name] of msg.names.entries()) {
                const item = document.createElement("div");
                item.className = "attachment-item";
                const label = document.createElement("span");
                label.className = "attachment-name";
                label.textContent = name;
                label.title = name;
                const remove = document.createElement("button");
                remove.className = "remove-attachment";
                remove.type = "button";
                remove.title = "Remove " + name;
                remove.setAttribute("aria-label", "Remove " + name);
                remove.textContent = "×";
                remove.addEventListener("click", () =>
                  vscode.postMessage({ type: "removeAttachment", index }),
                );
                item.append(label, remove);
                children.push(item);
              }
              attachmentsEl.innerHTML = "";
              for (const child of children) {
                attachmentsEl.appendChild(child);
              }
            }
            break;
        }
      });

      vscode.postMessage({ type: "ready" });
    </script>
  </body>
</html>
`;
