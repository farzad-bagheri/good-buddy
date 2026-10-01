import type { TimelineItem } from "../../../types";
import { vscode } from "../../../vscode";
import styles from "../Proposal.module.css";

type WriteProposalItem = Extract<TimelineItem, { kind: "writeProposal" }>;

export function WriteProposal({ item }: { item: WriteProposalItem }) {
  const handleReviewWrite = (approved: boolean) => {
    vscode.postMessage({
      type: "wv:reviewWrite",
      id: item.proposalId,
      approved,
    });
  };

  return (
    <section className={styles.proposal}>
      <strong>Proposed change: {item.path}</strong>
      <pre>{item.diff}</pre>
      {item.status ? (
        <div>{item.status}</div>
      ) : (
        <div className={styles.actions}>
          {[true, false].map((approved) => (
            <button
              key={String(approved)}
              type="button"
              onClick={() => handleReviewWrite(approved)}
            >
              {approved ? "Approve" : "Reject"}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
