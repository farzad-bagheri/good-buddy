import type { AttachmentState } from "../../types";
import { vscode } from "../../vscode";
import { IconButton } from "../IconButton";
import { Attachment } from "./Attachment";
import styles from "./Composer.module.css";

interface ComposerProps {
  attachments: AttachmentState;
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
}

export function Composer({
  attachments,
  text,
  onTextChange,
  onSend,
}: ComposerProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.attachments}>
        {attachments.activeDocument && (
          <Attachment
            name={attachments.activeDocument.name}
            path={attachments.activeDocument.path}
          />
        )}
        {attachments.attached.map((item, index) => (
          <Attachment
            key={`${item.name}-${index}`}
            name={item.name}
            path={item.path}
            onRemove={() =>
              vscode.postMessage({ type: "removeAttachment", index })
            }
          />
        ))}
      </div>

      <div className={styles.composer}>
        <textarea
          rows={2}
          placeholder="Ask Good Buddy... (Enter to send, Shift+Enter for new line)"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />

        <div className={styles.controls}>
          <IconButton
            iconClassName="add-icon"
            title="Attach text files"
            onClick={() => vscode.postMessage({ type: "attachFiles" })}
          />
          <IconButton
            iconClassName="send-icon"
            title="Send message"
            onClick={onSend}
          />
        </div>
      </div>
    </footer>
  );
}
