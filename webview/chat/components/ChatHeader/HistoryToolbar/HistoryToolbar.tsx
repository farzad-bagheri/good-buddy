import { IconButton } from "../../IconButton/IconButton";

interface ChatToolbarProps {
  onToggleHistory: () => void;
}

export function HistoryToolbar({ onToggleHistory }: ChatToolbarProps) {
  return (
    <div className="toolbar">
      <IconButton
        iconClassName="send-icon"
        caption="Back"
        title="Back to chat view"
        onClick={onToggleHistory}
      />
    </div>
  );
}
