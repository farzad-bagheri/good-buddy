import { IconButton } from "../../IconButton/IconButton";

interface ChatToolbarProps {
  onToggleHistory: () => void;
}

export function HistoryToolbar({ onToggleHistory }: ChatToolbarProps) {
  return (
    <div className="toolbar">
      <IconButton
        iconClassName="back-icon"
        caption="Back"
        title="Back to chat view"
        onClick={onToggleHistory}
      />
    </div>
  );
}
