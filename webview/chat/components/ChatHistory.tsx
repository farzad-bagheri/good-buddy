import type { ChatSummary } from "../types";
import "./ChatHistory.css";

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
    <section className="chat-history" aria-label="Saved chats">
      {history.length === 0 ? (
        <p className="chat-history-empty">No saved chats</p>
      ) : (
        history.map((chat) => (
          <div className="chat-history-item" key={chat.id}>
            <button
              className="chat-history-open"
              type="button"
              title={chat.title}
              onClick={() => onResume(chat.id)}
            >
              <span className="chat-history-title">{chat.title}</span>
              <span className="chat-history-date">
                {new Date(chat.updatedAt).toLocaleString()}
              </span>
            </button>
            <button
              className="chat-history-delete"
              type="button"
              title="Delete chat"
              aria-label={`Delete ${chat.title}`}
              onClick={() => onDelete(chat.id)}
            >
              x
            </button>
          </div>
        ))
      )}
    </section>
  );
}