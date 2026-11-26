import type { TimelineItem } from "../../../types";
import { vscode } from "../../../vscode";
import styles from "./CommandProposal.module.css";

type CommandProposalItem = Extract<TimelineItem, { kind: "commandProposal" }>;

export function CommandProposal({ item }: { item: CommandProposalItem }) {
  const handleReviewCommand = (approved: boolean) => {
    vscode.postMessage({
      type: "wv:reviewCommand",
      id: item.commandId,
      approved,
    });
  };

  return (
    <section className={styles.terminal} aria-label="Command execution">
      <div className={styles.header}>
        <span className={styles.indicator} aria-hidden="true" />
        <strong>Terminal</strong>
        <span className={styles.headerLabel}>Run command</span>
      </div>
      <div className={styles.screen}>
        <div className={styles.command}><span className={styles.prompt} aria-hidden="true">❯</span><pre>{item.command}</pre></div>
        {item.output && <pre className={styles.output}>{item.output}</pre>}
      </div>
      {item.status ? (
        <div className={styles.status} role="status">{item.status}</div>
      ) : item.autoApproved ? (
        <div className={styles.status} role="status">Running command...</div>
      ) : (
        <div className={styles.actions}>
          {[true, false].map((approved) => (
            <button
              key={String(approved)}
              type="button"
              onClick={() => handleReviewCommand(approved)}
            >
              {approved ? "Run" : "Reject"}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
