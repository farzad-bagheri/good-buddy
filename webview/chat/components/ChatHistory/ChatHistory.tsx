import type { ChatSummary } from "../../types";
import { IconButton } from "../IconButton/IconButton";
import styles from "./ChatHistory.module.css";

export function ChatHistory({
  history,
  onResume,
  onDelete,
}: {
  history: ChatSummary[];
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className={styles.history} aria-label="Saved chats">
      {history.length === 0 ? (
        <p className={styles.empty}>No saved chats :(</p>
      ) : (
        history.map((chat) => (
          <div className={styles.item} key={chat.id}>
            <button
              className={styles.resume}
              type="button"
              title={chat.title}
              onClick={() => onResume(chat.id)}
            >
              <span className={styles.title}>{chat.title}</span>
              <span className={styles.date}>
                {new Date(chat.updatedAt).toLocaleString()}
              </span>
            </button>
            <IconButton
              iconClassName="delete-icon"
              type="button"
              title="Delete chat"
              onClick={() => onDelete(chat.id)}
            />
          </div>
        ))
      )}
    </section>
  );
}
