import styles from "./ThinkingIndicator.module.css";

export function ThinkingIndicator({ slowResponse }: { slowResponse: boolean }) {
  return (
    <div role="status" aria-live="polite">
      <div className={styles.indicator}>
        <span>Thinking</span>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      {slowResponse && (
        <div className={styles.warning}>
          The model is taking longer than expected. If you are running a local
          model, make sure your machine has enough RAM and check that your model
          server and Good Buddy are configured correctly. The first run can be
          slower while the model starts up.
        </div>
      )}
    </div>
  );
}
