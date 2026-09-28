import type { TimelineItem } from "../../../types";
import { vscode } from "../../../vscode";
// import styles from './CommandProposal.module.css';

type CommandProposalItem = Extract<TimelineItem, { kind: "commandProposal" }>;

export function CommandProposal({ item }: { item: CommandProposalItem }) {
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
