import { IconButton } from "../../IconButton/IconButton";

interface ChatToolbarProps {
  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onToggleHistory: () => void;
  onNewChat: () => void;
}

export function ChatToolbar({
  models,
  selectedModel,
  onModelChange,
  onToggleHistory,
  onNewChat,
}: ChatToolbarProps) {
  return (
    <div className="toolbar">
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
      <IconButton
        title="New chat"
        iconClassName="new-chat-icon"
        onClick={onNewChat}
      />
      <IconButton
        title="Saved chats"
        iconClassName="history-icon"
        onClick={onToggleHistory}
      />
    </div>
  );
}
