import { IconButton } from "../../IconButton";
import styles from "./Attachment.module.css";

export interface AttachmentProps {
  name: string;
  path: string;
  onRemove?: () => void;
}
export function Attachment({ name, path, onRemove }: AttachmentProps) {
  return (
    <div className={styles.item}>
      <span className={styles.name} title={path}>
        {name}
      </span>

      {onRemove && (
        <IconButton
          iconName="remove-icon"
          title="Remove attachment"
          className={styles.remove}
          onClick={onRemove}
          aria-label="Remove attachment"
        />
      )}
    </div>
  );
}
