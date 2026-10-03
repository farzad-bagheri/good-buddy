import { useState } from "react";
import { IconButton } from "../../../components/IconButton";
import type { TimelineItem } from "../../../types";
import { sanitizeHtml } from "../../../utils";
import styles from "./Message.module.css";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;

interface MessageProps {
  item: MessageItem;
  onRetry: (historyIndex: number) => void;
  retryDisabled: boolean;
}
export function Message({ item, onRetry, retryDisabled }: MessageProps) {
  const [copied, setCopied] = useState(false);
  const historyIndex = item.historyIndex;

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className={`${styles.message} ${styles[item.role]}`}>
      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(item.html ?? item.text),
        }}
      />

      {item.role === "assistant" && historyIndex !== undefined && (
        <div className={styles["action"]}>
          <IconButton
            className={styles["button"]}
            iconName={copied ? "check-icon" : "copy-icon"}
            title={copied ? "Copied!" : "Copy message"}
            aria-label={copied ? "Copied!" : "Copy message"}
            onClick={handleCopy}
            disabled={copied}
          />
          <IconButton
            className={styles["button"]}
            iconName="retry-icon"
            title="Retry generating response"
            aria-label="retry"
            onClick={() => onRetry(historyIndex)}
            disabled={retryDisabled}
          />
        </div>
      )}
    </article>
  );
}
