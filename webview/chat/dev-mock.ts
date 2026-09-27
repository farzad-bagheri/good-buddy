// Dev-only harness: simulates extension-host responses so the UI is usable via `pnpm run dev:webview`.
// Loaded only when import.meta.env.DEV is true; excluded from the packaged webview build.
import type { ChatSummary } from "./types";

function post(message: Record<string, unknown>) {
  window.postMessage(message, "*");
}

const mockHistory: ChatSummary[] = [
  {
    id: "1",
    title: "Refactor auth module",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "Explain the event loop",
    updatedAt: new Date().toISOString(),
  },
];

// Listen for messages from webview (simulating VS Code extension host)
window.addEventListener("mock-vscode-message", (event) => {
  const message = (event as CustomEvent<Record<string, unknown>>).detail;
  switch (message.type) {
    case "ready":
      post({
        type: "models",
        models: ["llama3", "qwen2.5-coder"],
        selected: "llama3",
      });
      post({ type: "history", messages: [] });
      break;
    case "listChats": // message from webview requesting the chat list
      post({ type: "chatList", chats: mockHistory }); // post to webview
      break;
    case "send":
      post({ type: "userMessage", text: message.text });
      post({ type: "modelStatus", waiting: true });
      post({ type: "assistantStart" });
      setTimeout(() => {
        post({ type: "assistantChunk", html: `<p>Echo: ${message.text}</p>` });
        post({ type: "assistantDone" });
      }, 400);
      break;
  }
});

console.info(
  "[good-buddy] Browser dev mock active — messages are simulated locally, no real model is called.",
);
