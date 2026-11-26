import { useState } from "react";
import type { ChatSummary } from "../../types";
import styles from "./ChatHistory.module.css";

export function ChatHistory({
  history,
  allChats,
  projectName,
  onResume,
  onDelete, onExport,
}: {
  history: ChatSummary[];
  allChats: boolean;
  projectName?: string;
  onResume: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onExport: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const ids = history.filter((chat) => selected.includes(chat.id)).map((chat) => chat.id);
  const handleResume = (id: string) => () => {
    onResume(id);
  };

  return (
    <section className={styles.history} aria-label="Saved chats">
      {history.length > 0 && <div className={styles.actions}>
        <label><input type="checkbox" checked={ids.length === history.length} onChange={(event) => setSelected(event.target.checked ? history.map((chat) => chat.id) : [])} /> Select all</label>
        <button type="button" disabled={!ids.length} onClick={() => onExport(ids)}>Export ({ids.length})</button>
        <button type="button" disabled={!ids.length} onClick={() => onDelete(ids)}>Delete ({ids.length})</button>
      </div>}
      {history.length === 0 ? (
        <p className={styles.empty}>
          {allChats
            ? "No saved chats yet."
            : projectName
              ? `No saved chats for ${projectName}.`
              : "No saved chats without a workspace."}
        </p>
      ) : (
        history.map((chat) => (
          <div className={styles.item} key={chat.id}>
            <input type="checkbox" aria-label={`Select ${chat.title}`} checked={ids.includes(chat.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, chat.id] : previous.filter((id) => id !== chat.id))} />
            <button
              className={styles.resume}
              type="button"
              title={chat.title}
              onClick={handleResume(chat.id)}
            >
              <span className={styles.title}>{chat.title}</span>
              {allChats && (
                <span className={styles.project}>
                  {chat.projectName ?? "No workspace"}
                </span>
              )}
              <span className={styles.date}>
                {new Date(chat.updatedAt).toLocaleString()}
              </span>
            </button>
          </div>
        ))
      )}
    </section>
  );
}
