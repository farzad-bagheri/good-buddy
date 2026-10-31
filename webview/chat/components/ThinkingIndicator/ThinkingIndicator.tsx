import styles from "./ThinkingIndicator.module.css";

export function ThinkingIndicator() {
  return (
    <div className={styles.indicator} role="status" aria-live="polite">
      <span>Thinking</span>
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
