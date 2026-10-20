import styles from "./IconButton.module.css";

export interface IconButtonProps {
  type?: "button" | "submit" | "reset";
  className?: string;
  caption?: string;
  title?: string;
  iconName?: string;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  id?: string;
  role?: string;
  onClick: () => void;
}

export function IconButton({
  type = "button",
  className,
  caption,
  title,
  iconName,
  iconPosition = "left",
  disabled = false,
  id,
  role,
  onClick,
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      disabled={disabled}
      id={id}
      role={role}
      onClick={onClick}
      className={`${styles["icon-button"]} ${className ?? ""}`}
    >
      <div className={styles["icon-button-container"]}>
        {iconName && iconPosition === "left" && (
          <span
            className={`${styles["icon"]} ${iconName}`}
            aria-hidden="true"
          />
        )}
        {caption && (
          <span className={styles["control-caption"]}>{caption}</span>
        )}
        {iconName && iconPosition === "right" && (
          <span
            className={`${styles["icon"]} ${iconName}`}
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}
