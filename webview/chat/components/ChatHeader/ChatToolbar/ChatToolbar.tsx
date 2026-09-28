import { ProviderModel } from "../../../types";
import { IconButton } from "../../IconButton/IconButton";
import styles from "./ChatToolbar.module.css";

interface ChatToolbarProps {
  models: ProviderModel[];
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
    <div className={styles.toolbar}>
      <select
        aria-label="Chat model"
        value={selectedModel}
        onChange={handleModelChange}
      >
        {models.map((model) => (
          <option key={model.model} value={model.model}>
            {model.caption}
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
