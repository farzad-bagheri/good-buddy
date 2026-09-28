import type { TimelineItem } from "../../types";

type ToolStatusItem = Extract<TimelineItem, { kind: "toolStatus" }>;

export function ToolStatus({ item }: { item: ToolStatusItem }) {
  return <div className="tool-status">{item.text}</div>;
}
