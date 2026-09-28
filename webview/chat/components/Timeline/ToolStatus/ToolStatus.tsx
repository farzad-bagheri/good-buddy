import type { TimelineItem } from "../../../types";
import styles from './ToolStatus.module.css';

type ToolStatusItem = Extract<TimelineItem, { kind: "toolStatus" }>;

export function ToolStatus({ item }: { item: ToolStatusItem }) {
  return <div className={styles["status"]}>{item.text}</div>;
}
