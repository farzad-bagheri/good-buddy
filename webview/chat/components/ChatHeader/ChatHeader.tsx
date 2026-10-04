import { ProviderModel } from "../../types";
import styles from "./ChatHeader.module.css";
import { ChatToolbar } from "./ChatToolbar";
import { HistoryToolbar } from "./HistoryToolbar";

interface ChatHeaderProps {
  models: ProviderModel[];
  selectedModel: string;
  historyOpen: boolean;
  onModelChange: (model: string) => void;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onOpenSetup: () => void;
}

export function ChatHeader({
  models,
  selectedModel,
  historyOpen,
  onModelChange,
  onToggleHistory,
  onNewChat,
  onOpenSetup,
}: ChatHeaderProps) {
  return (
    <header className={styles["chat-header"]}>
      {historyOpen ? (
        <HistoryToolbar
          onToggleHistory={onToggleHistory}
        />
      ) : (
        <ChatToolbar
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          onToggleHistory={onToggleHistory}
          onNewChat={onNewChat}
          onOpenSetup={onOpenSetup}
        />
      )}
    </header>
  );
}
