import type { TimelineItem } from "../../types";
import { CommandProposal } from "./CommandProposal";
import { Message } from "./Message";
import { ToolStatus } from "./ToolStatus";
import { WriteProposal } from "./WriteProposal";

interface TimelineProps {
  items: TimelineItem[];
  onRetry: (historyIndex: number) => void;
  retryDisabled: boolean;
}

export function Timeline({ onRetry, retryDisabled, items }: TimelineProps) {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case "message":
            return (
              <Message
                key={item.id}
                item={item}
                onRetry={onRetry}
                retryDisabled={retryDisabled}
              />
            );
          case "toolStatus":
            return <ToolStatus key={item.id} item={item} />;
          case "writeProposal":
            return <WriteProposal key={item.id} item={item} />;
          case "commandProposal":
            return <CommandProposal key={item.id} item={item} />;
        }
      })}
    </>
  );
}
