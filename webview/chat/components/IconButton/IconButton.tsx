import styles from "./IconButton.module.css";

export interface IconButtonProps {
  type?: "button" | "submit" | "reset";
  caption?: string;
  title?: string;
  iconClassName?: string;
  onClick: () => void;
}

export function IconButton({
  type = "button",
  caption,
  title,
  iconClassName,
  onClick,
}: IconButtonProps) {
  return (
    <button type={type} title={title} aria-label={title} onClick={onClick} className={styles["icon-button"]}>
      <div className={styles["icon-button-container"]}>
      {caption && <span className={styles["control-caption"]}>{caption}</span>}
      {iconClassName && (
        <span
          className={`${styles["icon"]} ${iconClassName}`}
          aria-hidden="true"
        />
      )}</div>
    </button>
  );
}
