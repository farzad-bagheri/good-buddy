import styles from "./IconButton.module.css";

export interface IconButtonProps {
  type?: "button" | "submit" | "reset";
  className?: string;
  caption?: string;
  title?: string;
  iconName?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function IconButton({
  type = "button",
  className,
  caption,
  title,
  iconName,
  disabled = false,
  onClick,
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`${styles["icon-button"]} ${className ?? ""}`}
    >
      <div className={styles["icon-button-container"]}>
        {caption && (
          <span className={styles["control-caption"]}>{caption}</span>
        )}
        {iconName && (
          <span
            className={`${styles["icon"]} ${iconName}`}
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}
