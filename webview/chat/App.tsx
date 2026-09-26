import { useEffect, useRef, useState } from "react";
import { ChatHeader, } from "./components/ChatHeader";
import { ChatHistory } from "./components/ChatHistory";
import { Composer } from "./components/Composer";
import { Timeline } from "./components/Timeline";
import type {
  AttachmentState,
  ChatSummary,
  NewTimelineItem,
  TimelineItem,
} from "./types";
import { createItemId } from "./utils";
import { vscode } from "./vscode";

export function App() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * The list of timeline items representing the conversation and other events.
   */
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentState>({
    names: [],
  });
  /**
   * The current text input in the composer.
   */
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  /**
   * The ID of the current assistant message being composed.
   */
  const assistantId = useRef<string | undefined>(undefined);
  /**
   * A reference to the div element at the end of the message list.
   */
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for messages from the VS Code extension.
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

  // Scroll to the end of the messages when items or thinking state changes.
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
      <ChatHeader
        models={models}
        selectedModel={selectedModel}
        onModelChange={(model) => {
          setSelectedModel(model);
          vscode.postMessage({ type: "selectModel", model });
        }}
        onToggleHistory={toggleHistory}
        onNewChat={() => {
          setHistoryOpen(false);
          vscode.postMessage({ type: "newChat" });
        }}
      />

      {historyOpen && (
        <ChatHistory
          history={history}
          onResume={(id) => vscode.postMessage({ type: "resumeChat", id })}
          onDelete={(id) => vscode.postMessage({ type: "deleteChat", id })}
        />
      )}

      <section className="messages" aria-live="polite" hidden={historyOpen}>
        <Timeline items={items} />
        {thinking && (
          <div className="tool-status" role="status">
            Thinking...
          </div>
        )}
        <div ref={endOfMessages} />
      </section>

      <Composer
        attachments={attachments}
        text={text}
        onTextChange={setText}
        onSend={send}
      />
    </main>
  );
}
