import "./ChatHeader.css";

interface ChatHeaderProps {
  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onToggleHistory: () => void;
  onNewChat: () => void;
}

export function ChatHeader({
  models,
  selectedModel,
  onModelChange,
  onToggleHistory,
  onNewChat,
}: ChatHeaderProps) {
  return (
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
        History
      </button>
      <button type="button" title="New chat" onClick={onNewChat}>
        New
      </button>
    </header>
  );
}

