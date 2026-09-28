import type { TimelineItem } from "../../types";
import { TimelineEntry } from "./TimelineEntry";
import "./Timeline.module.css";

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <>
      {items.map((item) => (
        <TimelineEntry item={item} key={item.id} />
      ))}
    </>
  );
}
