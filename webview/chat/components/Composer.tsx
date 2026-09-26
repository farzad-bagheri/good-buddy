import type { AttachmentState } from "../types";
import { vscode } from "../vscode";
import "./Composer.css";

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
    <footer className="chat-footer">
      <div className="attachments">
        {attachments.activeDocument && (
          <div className="attachment-item">
            <span
              className="attachment-name"
              title="Included with your next message"
            >
              Open: {attachments.activeDocument}
            </span>
          </div>
        )}
        {attachments.names.map((name, index) => (
          <div className="attachment-item" key={`${name}-${index}`}>
            <span className="attachment-name" title={name}>
              {name}
            </span>
            <button
              className="remove-attachment"
              type="button"
              title={`Remove ${name}`}
              aria-label={`Remove ${name}`}
              onClick={() =>
                vscode.postMessage({ type: "removeAttachment", index })
              }
            >
              x
            </button>
          </div>
        ))}
      </div>
      <div className="composer">
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
        <div className="controls">
          <button
            type="button"
            title="Attach text files"
            aria-label="Attach text files"
            onClick={() => vscode.postMessage({ type: "attachFiles" })}
          >
            <span className="control-icon attach-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Send message"
            aria-label="Send message"
            onClick={onSend}
          >
            <span className="control-icon send-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}
