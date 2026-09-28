import type { TimelineItem } from "../../../types";
import { vscode } from "../../../vscode";
import styles from "../Proposal.module.css";

type CommandProposalItem = Extract<TimelineItem, { kind: "commandProposal" }>;

export function CommandProposal({ item }: { item: CommandProposalItem }) {
  return (
    <section className={styles.proposal}>
      <strong>Run command</strong>
      <pre>{item.command}</pre>
      <pre className={styles.commandOutput} hidden={!item.output}>
        {item.output}
      </pre>
      {item.status ? (
        <div>{item.status}</div>
      ) : item.autoApproved ? (
        <div>Running command...</div>
      ) : (
        <div className={styles.actions}>
          {[true, false].map((approved) => (
            <button
              key={String(approved)}
              type="button"
              onClick={() =>
                vscode.postMessage({
                  type: "wv:reviewCommand",
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
