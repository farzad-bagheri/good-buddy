import type { ProviderStatusInfo } from "../../types";
import styles from "./ProviderNotice.module.css";

interface ProviderNoticeProps {
  provider: ProviderStatusInfo;
  compact: boolean;
  onOpenSetup: () => void;
}

export function ProviderNotice({
  provider,
  compact,
  onOpenSetup,
}: ProviderNoticeProps) {
  const isOllama = provider.provider === "ollama";
  const providerName = isOllama ? "Ollama" : "OpenAI-compatible server";

  const message = (() => {
    switch (provider.status) {
      case "checking":
        return `Connecting to ${providerName}...`;
      case "unavailable":
        return `Good Buddy cannot connect to ${providerName}. Check the endpoint and provider settings.`;
      case "no-models":
        return isOllama
          ? "The server is connected but has no downloaded models."
          : "The server is connected but has no available models.";
      case "models-unselected":
        return "Choose chat and inline-completion models to finish setup.";
      case "models-missing":
        return "A selected model is no longer available from this server.";
      case "ready":
        return "";
    }
  })();

  return (
    <section
      className={`${styles.notice} ${compact ? styles.compact : styles.centered}`}
      aria-live="polite"
    >
      <div className={styles.content}>
        <h2>Model setup</h2>
        <p className={styles.description}>{message}</p>
        <p className={styles.hint}>
          Configure your provider and choose models from the{" "}
          <strong>Models</strong> button in the chat toolbar.
        </p>
        <button className={styles.setupButton} onClick={onOpenSetup}>
          Open model setup
        </button>
      </div>
    </section>
  );
}
