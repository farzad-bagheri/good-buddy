import { IconButton } from "../../IconButton";
import styles from "./Attachment.module.css";

export interface AttachmentProps {
  name: string;
  path: string;
  onRemove?: () => void;
  removeTitle?: string;
}
export function Attachment({
  name,
  path,
  onRemove,
  removeTitle = "Remove attachment",
}: AttachmentProps) {
  return (
    <div className={styles.item}>
      <span className={styles.name} title={path}>
        {name}
      </span>

      {onRemove && (
        <IconButton
          iconName="remove-icon"
          title={removeTitle}
          className={styles.remove}
          onClick={onRemove}
          aria-label="Remove attachment"
        />
      )}
    </div>
  );
}
