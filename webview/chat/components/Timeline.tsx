import { sanitizeHtml } from "../utils";
import type { TimelineItem } from "../types";
import { vscode } from "../vscode";
import "./Timeline.css";

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <>
      {items.map((item) => (
        <TimelineEntry item={item} key={item.id} />
      ))}
    </>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case "message":
      return (
        <article className={`message ${item.role}`}>
          {item.role === "assistant" ? (
            <div
              className="body markdown"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(item.html ?? item.text),
              }}
            />
          ) : (
            <div className="body">{item.text}</div>
          )}
        </article>
      );
    case "toolStatus":
      return <div className="tool-status">{item.text}</div>;
    case "writeProposal":
      return (
        <section className="proposal">
          <strong>Proposed change: {item.path}</strong>
          <pre>{item.diff}</pre>
          {item.status ? (
            <div>{item.status}</div>
          ) : (
            <div className="proposal-actions">
              {[true, false].map((approved) => (
                <button
                  key={String(approved)}
                  type="button"
                  onClick={() =>
                    vscode.postMessage({
                      type: "reviewWrite",
                      id: item.proposalId,
                      approved,
                    })
                  }
                >
                  {approved ? "Approve" : "Reject"}
                </button>
              ))}
            </div>
          )}
        </section>
      );
    case "commandProposal":
      return (
        <section className="proposal command-proposal">
          <strong>Run command</strong>
          <pre>{item.command}</pre>
          <pre className="command-output" hidden={!item.output}>
            {item.output}
          </pre>
          {item.status ? (
            <div>{item.status}</div>
          ) : item.autoApproved ? (
            <div>Running command...</div>
          ) : (
            <div className="proposal-actions">
              {[true, false].map((approved) => (
                <button
                  key={String(approved)}
                  type="button"
                  onClick={() =>
                    vscode.postMessage({
                      type: "reviewCommand",
                      id: item.commandId,
                      approved,
                    })
                  }
                >
                  {approved ? "Run" : "Reject"}
                </button>
              ))}
            </div>
          )}
        </section>
      );
  }
}
