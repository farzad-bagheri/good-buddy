import { useEffect, useRef, useState } from "react";
import { ChatHeader } from "./components/ChatHeader";
import { ChatHistory } from "./components/ChatHistory";
import { Composer } from "./components/Composer";
import { ProviderNotice } from "./components/ProviderNotice";
import { Suggestions } from "./components/Suggestions";
import { Timeline } from "./components/Timeline";
import {
  appendCommandOutput,
  appendCommandProposal,
  appendTimelineItem,
  completeCommandProposal,
  mapHistoryToTimelineItems,
  updateAssistantMessage,
  updateWriteProposal,
} from "./timelineUtils";
import type {
  AttachmentState,
  ChatSummary,
  NewTimelineItem,
  ProviderModel,
  ProviderStatusInfo,
  TimelineItem,
} from "./types";
import { createItemId } from "./utils";
import { vscode } from "./vscode";

export function App() {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderStatusInfo>({
    status: "checking",
    endpoint: "",
    chatModel: "",
    completionModel: "",
    missingModels: [],
    artworkUri: "",
  });
  /**
   * The list of timeline items representing the conversation and other events.
   */
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentState>({
    attached: [],
    activeDocument: undefined,
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
        case "vsc:models":
          setModels(message.models);
          setSelectedModel(message.selected);
          break;
        case "vsc:providerStatus":
          setProvider({
            status: message.status,
            endpoint: message.endpoint,
            chatModel: message.chatModel,
            completionModel: message.completionModel,
            missingModels: message.missingModels,
            artworkUri: message.artworkUri,
          });
          break;
        case "vsc:history":
          setHistoryOpen(false);
          setThinking(message.thinking === true);
          assistantId.current = undefined;
          setItems(mapHistoryToTimelineItems(message.messages));
          break;
        case "vsc:chatList":
          setHistory(message.chats);
          break;
        case "vsc:userMessage":
          appendItem({
            kind: "message",
            role: "user",
            text: message.text,
            html: message.html,
            historyIndex: message.historyIndex,
          });
          break;
        case "vsc:assistantStart": {
          setThinking(false);
          const id = createItemId();
          assistantId.current = id;
          setItems((current) =>
            appendTimelineItem(current, {
              kind: "message",
              role: "assistant",
              text: "",
              historyIndex: message.historyIndex,
            }),
          );
          break;
        }
        case "vsc:assistantChunk":
          if (assistantId.current) {
            const id = assistantId.current;
            setItems((current) =>
              updateAssistantMessage(current, id, { html: message.html }),
            );
          }
          break;
        case "vsc:assistantDone":
          setThinking(false);
          if (assistantId.current) {
            const id = assistantId.current;
            setItems((current) =>
              updateAssistantMessage(current, id, {
                suggestions: message.suggestions,
              }),
            );
          }
          assistantId.current = undefined;
          break;
        case "vsc:assistantError":
          setThinking(false);
          assistantId.current = undefined;
          appendItem({ kind: "message", role: "error", text: message.text });
          break;
        case "vsc:modelStatus":
          setThinking(message.waiting);
          break;
        case "vsc:toolStatus":
          appendItem({
            kind: "toolStatus",
            text: `${message.tool.autoApprove ? "Used" : "Proposed"} ${message.tool.tool}...`,
          });
          break;
        case "vsc:writeProposal":
          appendItem({
            kind: "writeProposal",
            proposalId: message.id,
            path: message.path,
            diff: message.diff,
          });
          break;
        case "vsc:writeComplete":
          setItems((current) =>
            updateWriteProposal(current, message.id, message.result),
          );
          break;
        case "vsc:commandProposal":
          addCommand(message.id, message.command, false);
          break;
        case "vsc:commandStart":
          addCommand(message.id, message.command, true);
          break;
        case "vsc:commandOutput":
          setItems((current) =>
            appendCommandOutput(current, message.id, message.text),
          );
          break;
        case "vsc:commandComplete":
          setItems((current) =>
            completeCommandProposal(current, message.id, message.result),
          );
          break;
        case "vsc:attachments":
          setAttachments({
            attached: message.attached,
            activeDocument: message.activeDocument,
          });
          break;
      }
    }

    function appendItem(item: NewTimelineItem) {
      setItems((current) => appendTimelineItem(current, item));
    }

    function addCommand(id: string, command: string, autoApproved: boolean) {
      setItems((current) =>
        appendCommandProposal(current, id, command, autoApproved),
      );
    }

    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "wv:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Scroll to the end of the messages when items or thinking state changes.
  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ block: "end" });
  }, [items, thinking]);

  const toggleHistory = () => {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (opening) vscode.postMessage({ type: "wv:listChats" });
  };

  const handleRetry = (historyIndex: number) => {
    setThinking(true);
    vscode.postMessage({ type: "wv:retry", historyIndex });
  };

  const handleCheckProvider = () => {
    setProvider((current) => ({
      ...current,
      status: "checking",
    }));
    vscode.postMessage({ type: "wv:checkProvider" });
  };

  const latestMessage = [...items]
    .reverse()
    .find((item) => item.kind === "message");

  const suggestions =
    !thinking && latestMessage?.role === "assistant"
      ? latestMessage.suggestions
      : undefined;

  const hasConversation = items.some(
    (item) =>
      item.kind === "message" &&
      (item.role === "user" || item.role === "assistant"),
  );

  return (
    <main className="chat-app">
      <ChatHeader
        models={models}
        selectedModel={selectedModel}
        historyOpen={historyOpen}
        onModelChange={(model) => {
          setSelectedModel(model);
          vscode.postMessage({ type: "wv:selectModel", model });
        }}
        onToggleHistory={toggleHistory}
        onNewChat={() => {
          setHistoryOpen(false);
          vscode.postMessage({ type: "wv:newChat" });
        }}
      />

      {historyOpen ? (
        <ChatHistory
          history={history}
          onResume={(id) => vscode.postMessage({ type: "wv:resumeChat", id })}
          onDelete={(id) => vscode.postMessage({ type: "wv:deleteChat", id })}
        />
      ) : (
        <>
          <section className="messages" aria-live="polite" hidden={historyOpen}>
            {provider.status !== "ready" && (
              <ProviderNotice
                provider={provider}
                compact={hasConversation}
                onCheck={handleCheckProvider}
                onOpenSettings={() =>
                  vscode.postMessage({ type: "wv:openSettings" })
                }
              />
            )}
            <Timeline
              items={items}
              onRetry={handleRetry}
              retryDisabled={thinking}
            />
            {thinking && (
              <div className="tool-status" role="status">
                Thinking...
              </div>
            )}

            {suggestions?.length && (
              <Suggestions
                suggestions={suggestions}
                onSuggest={(t) => setText(t)}
              />
            )}
            <div ref={endOfMessages} />
          </section>
          <Composer
            attachments={attachments}
            text={text}
            onTextChange={setText}
            onSend={() => setThinking(true)}
          />
        </>
      )}
    </main>
  );
}
