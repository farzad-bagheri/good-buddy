import "./ChatHeader.css";

interface ChatHeaderProps {
  models: string[];
  selectedModel: string;
  historyOpen: boolean;
  onModelChange: (model: string) => void;
  onToggleHistory: () => void;
  onNewChat: () => void;
}

export function ChatHeader({
  models,
  selectedModel,
  historyOpen,
  onModelChange,
  onToggleHistory,
  onNewChat,
}: ChatHeaderProps) {
  return historyOpen ? (
    <header className="chat-header">
      <button type="button" title="Back to chat view" onClick={onToggleHistory}>
        👈 Back
      </button>
    </header>
  ) : (
    <header className="chat-header">
      <select
        aria-label="Chat model"
        value={selectedModel}
        onChange={(event) => onModelChange(event.target.value)}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
      <button type="button" title="Saved chats" onClick={onToggleHistory}>
        📜 History
      </button>
      <button type="button" title="New chat" onClick={onNewChat}>
        🆕 New
      </button>
    </header>
  );
}
