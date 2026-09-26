import { useEffect, useRef, useState } from "react";

interface VsCodeApi {
  postMessage(message: Record<string, unknown>): void;
}

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

type TimelineItem =
  | {
      id: string;
      kind: "message";
      role: "user" | "assistant" | "error";
      text: string;
      html?: string;
    }
  | { id: string; kind: "toolStatus"; text: string }
  | {
      id: string;
      kind: "writeProposal";
      proposalId: string;
      path: string;
      diff: string;
      status?: string;
    }
  | {
      id: string;
      kind: "commandProposal";
      commandId: string;
      command: string;
      autoApproved: boolean;
      output: string;
      status?: string;
    };

type NewTimelineItem =
  | Omit<Extract<TimelineItem, { kind: "message" }>, "id">
  | Omit<Extract<TimelineItem, { kind: "toolStatus" }>, "id">
  | Omit<Extract<TimelineItem, { kind: "writeProposal" }>, "id">
  | Omit<Extract<TimelineItem, { kind: "commandProposal" }>, "id">;

interface AttachmentState {
  names: string[];
  activeDocument?: string;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
let nextItemId = 0;

function createItemId(): string {
  nextItemId += 1;
  return String(nextItemId);
}

export function App() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentState>({
    names: [],
  });
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const assistantId = useRef<string | undefined>(undefined);
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = event.data;
      switch (message.type) {
        case "models":
          setModels(message.models);
          setSelectedModel(message.selected);
          break;
        case "history":
          setHistoryOpen(false);
          setThinking(false);
          assistantId.current = undefined;
          setItems(
            message.messages.map(
              (item: { role: string; content: string; html?: string }) => ({
                id: createItemId(),
                kind: "message",
                role: item.role,
                text: item.content,
                html: item.html,
              }),
            ),
          );
          break;
        case "chatList":
          setHistory(message.chats);
          break;
        case "userMessage":
          appendItem({ kind: "message", role: "user", text: message.text });
          break;
        case "assistantStart": {
          setThinking(false);
          const id = createItemId();
          assistantId.current = id;
          setItems((current) => [
            ...current,
            { id, kind: "message", role: "assistant", text: "" },
          ]);
          break;
        }
        case "assistantChunk":
          if (assistantId.current) {
            const id = assistantId.current;
            setItems((current) =>
              current.map((item) =>
                item.id === id && item.kind === "message"
                  ? { ...item, html: message.html }
                  : item,
              ),
            );
          }
          break;
        case "assistantDone":
          setThinking(false);
          assistantId.current = undefined;
          break;
        case "assistantError":
          setThinking(false);
          assistantId.current = undefined;
          appendItem({ kind: "message", role: "error", text: message.text });
          break;
        case "modelStatus":
          setThinking(message.waiting);
          break;
        case "toolStatus":
          appendItem({
            kind: "toolStatus",
            text: `${message.tool.autoApprove ? "Used" : "Proposed"} ${message.tool.tool}...`,
          });
          break;
        case "writeProposal":
          appendItem({
            kind: "writeProposal",
            proposalId: message.id,
            path: message.path,
            diff: message.diff,
          });
          break;
        case "writeComplete":
          setItems((current) =>
            current.map((item) =>
              item.kind === "writeProposal" && item.proposalId === message.id
                ? {
                    ...item,
                    status:
                      message.result === "Write denied by the user."
                        ? "Rejected"
                        : message.result.startsWith("Wrote ")
                          ? "Applied"
                          : `Not applied: ${message.result}`,
                  }
                : item,
            ),
          );
          break;
        case "commandProposal":
          addCommand(message.id, message.command, false);
          break;
        case "commandStart":
          addCommand(message.id, message.command, true);
          break;
        case "commandOutput":
          setItems((current) =>
            current.map((item) =>
              item.kind === "commandProposal" && item.commandId === message.id
                ? { ...item, output: item.output + message.text }
                : item,
            ),
          );
          break;
        case "commandComplete":
          setItems((current) =>
            current.map((item) =>
              item.kind === "commandProposal" && item.commandId === message.id
                ? {
                    ...item,
                    output: item.output || message.result,
                    status: message.result.startsWith("Command failed:")
                      ? "Command failed"
                      : "Completed",
                  }
                : item,
            ),
          );
          break;
        case "attachments":
          setAttachments({
            names: message.names,
            activeDocument: message.activeDocument,
          });
          break;
      }
    }

    function appendItem(item: NewTimelineItem) {
      setItems((current) => [
        ...current,
        { ...item, id: createItemId() } as TimelineItem,
      ]);
    }

    function addCommand(id: string, command: string, autoApproved: boolean) {
      setItems((current) => [
        ...current,
        {
          id: createItemId(),
          kind: "commandProposal",
          commandId: id,
          command,
          autoApproved,
          output: "",
          status: autoApproved ? "Running command..." : undefined,
        },
      ]);
    }

    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ block: "end" });
  }, [items, thinking]);

  function send() {
    if (!text.trim()) return;
    vscode.postMessage({ type: "send", text });
    setText("");
  }

  function toggleHistory() {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (opening) vscode.postMessage({ type: "listChats" });
  }

  return (
    <main className="chat-app">
      <header>
        <select
          aria-label="Chat model"
          value={selectedModel}
          onChange={(event) => {
            setSelectedModel(event.target.value);
            vscode.postMessage({
              type: "selectModel",
              model: event.target.value,
            });
          }}
        >
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <button type="button" title="Saved chats" onClick={toggleHistory}>
          History
        </button>
        <button
          type="button"
          title="New chat"
          onClick={() => {
            setHistoryOpen(false);
            vscode.postMessage({ type: "newChat" });
          }}
        >
          New
        </button>
      </header>

      {historyOpen && (
        <section className="chat-history" aria-label="Saved chats">
          {history.length === 0 ? (
            <p className="chat-history-empty">No saved chats</p>
          ) : (
            history.map((chat) => (
              <div className="chat-history-item" key={chat.id}>
                <button
                  className="chat-history-open"
                  type="button"
                  title={chat.title}
                  onClick={() =>
                    vscode.postMessage({ type: "resumeChat", id: chat.id })
                  }
                >
                  <span className="chat-history-title">{chat.title}</span>
                  <span className="chat-history-date">
                    {new Date(chat.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button
                  className="chat-history-delete"
                  type="button"
                  title="Delete chat"
                  aria-label={`Delete ${chat.title}`}
                  onClick={() =>
                    vscode.postMessage({ type: "deleteChat", id: chat.id })
                  }
                >
                  x
                </button>
              </div>
            ))
          )}
        </section>
      )}

      <section className="messages" aria-live="polite" hidden={historyOpen}>
        {items.map((item) => (
          <TimelineEntry item={item} key={item.id} />
        ))}
        {thinking && (
          <div className="tool-status" role="status">
            Thinking...
          </div>
        )}
        <div ref={endOfMessages} />
      </section>

      <footer>
        <div className="attachments">
          {attachments.activeDocument && (
            <div className="attachment-item">
              <span
                className="attachment-name"
                title="Included with your next message"
              >
                Open: {attachments.activeDocument}
              </span>
            </div>
          )}
          {attachments.names.map((name, index) => (
            <div className="attachment-item" key={`${name}-${index}`}>
              <span className="attachment-name" title={name}>
                {name}
              </span>
              <button
                className="remove-attachment"
                type="button"
                title={`Remove ${name}`}
                aria-label={`Remove ${name}`}
                onClick={() =>
                  vscode.postMessage({ type: "removeAttachment", index })
                }
              >
                x
              </button>
            </div>
          ))}
        </div>
        <div className="composer">
          <textarea
            rows={2}
            placeholder="Ask Good Buddy... (Enter to send, Shift+Enter for new line)"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="controls">
            <button
              type="button"
              title="Attach text files"
              aria-label="Attach text files"
              onClick={() => vscode.postMessage({ type: "attachFiles" })}
            >
              <span className="control-icon attach-icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Send message"
              aria-label="Send message"
              onClick={send}
            >
              <span className="control-icon send-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case "message":
      return (
        <article className={`message ${item.role}`}>
          {item.role === "assistant" ? (
            <div
              className="body markdown"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(item.html ?? item.text),
              }}
            />
          ) : (
            <div className="body">{item.text}</div>
          )}
        </article>
      );
    case "toolStatus":
      return <div className="tool-status">{item.text}</div>;
    case "writeProposal":
      return (
        <section className="proposal">
          <strong>Proposed change: {item.path}</strong>
          <pre>{item.diff}</pre>
          {item.status ? (
            <div>{item.status}</div>
          ) : (
            <div className="proposal-actions">
              {[true, false].map((approved) => (
                <button
                  key={String(approved)}
                  type="button"
                  onClick={() => {
                    vscode.postMessage({
                      type: "reviewWrite",
                      id: item.proposalId,
                      approved,
                    });
                  }}
                >
                  {approved ? "Approve" : "Reject"}
                </button>
              ))}
            </div>
          )}
        </section>
      );
    case "commandProposal":
      return (
        <section className="proposal command-proposal">
          <strong>Run command</strong>
          <pre>{item.command}</pre>
          <pre className="command-output" hidden={!item.output}>
            {item.output}
          </pre>
          {item.status ? (
            <div>{item.status}</div>
          ) : item.autoApproved ? (
            <div>Running command...</div>
          ) : (
            <div className="proposal-actions">
              {[true, false].map((approved) => (
                <button
                  key={String(approved)}
                  type="button"
                  onClick={() =>
                    vscode.postMessage({
                      type: "reviewCommand",
                      id: item.commandId,
                      approved,
                    })
                  }
                >
                  {approved ? "Run" : "Reject"}
                </button>
              ))}
            </div>
          )}
        </section>
      );
  }
}

function sanitizeHtml(html: string): string {
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
        ((name === "href" || name === "src") && /^javascript:/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return template.innerHTML;
}
