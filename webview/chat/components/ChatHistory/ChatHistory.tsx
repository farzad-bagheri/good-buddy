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
  const handleResume = (id: string) => () => {
    onResume(id);
  };

  const handleDelete = (id: string) => () => {
    onDelete(id);
  };
  
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
              onClick={handleResume(chat.id)}
            >
              <span className={styles.title}>{chat.title}</span>
              <span className={styles.date}>
                {new Date(chat.updatedAt).toLocaleString()}
              </span>
            </button>
            <IconButton
              iconName="delete-icon"
              type="button"
              title="Delete chat"
              onClick={handleDelete(chat.id)}
            />
          </div>
        ))
      )}
    </section>
  );
}
