import { IconButton } from "../../IconButton/IconButton";
import styles from "./HistoryToolbar.module.css";

interface ChatToolbarProps {
  onToggleHistory: () => void;
}

export function HistoryToolbar({ onToggleHistory }: ChatToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <IconButton
        iconName="back-icon"
        caption="Back"
        title="Back to chat view"
        onClick={onToggleHistory}
      />
    </div>
  );
}
