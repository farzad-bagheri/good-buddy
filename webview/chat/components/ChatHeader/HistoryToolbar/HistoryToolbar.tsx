import { IconButton } from "../../IconButton/IconButton";
import styles from "./HistoryToolbar.module.css";

interface ChatToolbarProps {
  allChats: boolean;
  projectName?: string;
  onToggleScope: () => void;
  onToggleHistory: () => void;
}

export function HistoryToolbar({
  allChats,
  projectName,
  onToggleScope,
  onToggleHistory,
}: ChatToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <IconButton
        caption={allChats ? `Current: ${projectName ?? "project"}` : "All chats"}
        title={allChats ? "Show chats for the current project" : "Show all chats"}
        onClick={onToggleScope}
      />
      <IconButton
        iconName="back-icon"
        caption="Back"
        title="Back to chat view"
        onClick={onToggleHistory}
      />
    </div>
  );
}
