import { ProviderModel } from "../../../types";
import { getVisionSupport, VISION_LABELS } from "../../../visionSupport";
import { IconButton } from "../../IconButton/IconButton";
import styles from "./ChatToolbar.module.css";

interface ChatToolbarProps {
  models: ProviderModel[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onOpenSetup: () => void;
}

export function ChatToolbar({
  models,
  selectedModel,
  onModelChange,
  onToggleHistory,
  onNewChat,
  onOpenSetup,
}: ChatToolbarProps) {
  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(event.target.value);
  };
  const vision = getVisionSupport(models, selectedModel);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <IconButton
          title="Configure provider and models"
          iconName="models-icon"
          onClick={onOpenSetup}
        />
        <select
          aria-label="Chat model"
          value={selectedModel}
          onChange={handleModelChange}
        >
          <option value="" disabled>
            {models.length ? "Select a chat model" : "No models available"}
          </option>
          {selectedModel &&
            !models.some(({ model }) => model === selectedModel) && (
              <option value={selectedModel} disabled>
                Unavailable: {selectedModel}
              </option>
            )}
          {models.map((model) => (
            <option key={model.model} value={model.model} title={model.model}>
              {model.caption}
              {model.capabilities?.includes("vision") ? " · Vision" : ""}
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
      <div className={styles.noteRow}>
        <span className={styles.note}>{selectedModel}</span>
        {vision !== "none" && (
          <span
            className={`${styles.badge} ${
              {
                supported: styles.badgeSupported,
                unsupported: styles.badgeUnsupported,
                unknown: styles.badgeUnknown,
              }[vision]
            }`}
            title={VISION_LABELS[vision].title}
          >
            {VISION_LABELS[vision].label}
          </span>
        )}
      </div>
    </div>
  );
}
