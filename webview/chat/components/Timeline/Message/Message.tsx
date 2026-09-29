import { useState } from "react";
import { IconButton } from "../../../components/IconButton";
import type { TimelineItem } from "../../../types";
import { sanitizeHtml } from "../../../utils";
import styles from "./Message.module.css";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;

export function Message({ item }: { item: MessageItem }) {
  const [copied, setCopied] = useState(false);

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

      {item.role === "assistant" && (
        <IconButton
          className={styles["copy-button"]}
          iconName={copied ? "check-icon" : "copy-icon"}
          title={copied ? "Copied!" : "Copy message"}
          aria-label={copied ? "Copied!" : "Copy message"}
          onClick={handleCopy}
          disabled={copied}
        />
      )}
    </article>
  );
}
