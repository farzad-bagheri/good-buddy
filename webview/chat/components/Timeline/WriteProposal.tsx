import type { TimelineItem } from "../../types";
import { vscode } from "../../vscode";

type WriteProposalItem = Extract<TimelineItem, { kind: "writeProposal" }>;

export function WriteProposal({ item }: { item: WriteProposalItem }) {
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
                  type: "wv:reviewWrite",
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
}
