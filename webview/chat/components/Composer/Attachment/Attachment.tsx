import { IconButton } from "../../IconButton";
import styles from "./Attachment.module.css";

export interface AttachmentProps {
  name: string;
  path: string;
  onRemove?: () => void;
  removeTitle?: string;
  disabled?: boolean;
}
export function Attachment({
  name,
  path,
  onRemove,
  removeTitle = "Remove attachment",
  disabled = false,
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
          disabled={disabled}
          onClick={onRemove}
          aria-label="Remove attachment"
        />
      )}
    </div>
  );
}
