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
  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(event.target.value);
  };

  return (
    <div className="toolbar">
      <select
        aria-label="Chat model"
        value={selectedModel}
        onChange={handleModelChange}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
      <IconButton
        title="New chat"
        iconName="new-chat-icon"
        onClick={onNewChat}
      />
      <IconButton
        title="Saved chats"
        iconName="history-icon"
        onClick={onToggleHistory}
      />
    </div>
  );
}
