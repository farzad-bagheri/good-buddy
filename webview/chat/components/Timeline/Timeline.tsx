import type { TimelineItem } from "../../types";
import { CommandProposal } from "./CommandProposal";
import { Message } from "./Message";
import { ToolStatus } from "./ToolStatus";
import { WriteProposal } from "./WriteProposal";

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
      return <Message item={item} />;
    case "toolStatus":
      return <ToolStatus item={item} />;
    case "writeProposal":
      return <WriteProposal item={item} />;
    case "commandProposal":
      return <CommandProposal item={item} />;
  }
}
