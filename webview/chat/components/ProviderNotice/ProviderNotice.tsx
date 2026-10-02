import { useState } from "react";
import { IconButton } from "../../components/IconButton";
import type { ProviderStatusInfo } from "../../types";
import styles from "./ProviderNotice.module.css";

interface ProviderNoticeProps {
  provider: ProviderStatusInfo;
  compact: boolean;
  onCheck: () => void;
  onOpenSettings: () => void;
}

export function ProviderNotice({
  provider,
  compact,
  onCheck,
  onOpenSettings,
}: ProviderNoticeProps) {
  const checking = provider.status === "checking";
  const unavailable = provider.status === "unavailable";
  const hasMissingModels = provider.status === "models-missing";
  const missingChatModel = provider.missingModels.includes(provider.chatModel);
  const missingCompletionModel = provider.missingModels.includes(
    provider.completionModel,
  );

  const title = checking
    ? "Checking Ollama"
    : hasMissingModels
      ? "Install the configured models"
      : "Start Ollama to chat with Good Buddy";

  const message = checking
    ? "Connecting to your local model server..."
    : hasMissingModels
      ? "Ollama is running, but one or more configured models are missing."
      : "Good Buddy uses a local Ollama server. Open the Ollama app or start the server below.";

  return (
    <section
      className={`${styles.notice} ${compact ? styles.compact : styles.centered}`}
      aria-live="polite"
    >
      {!compact && provider.artworkUri && (
        <img className={styles.artwork} src={provider.artworkUri} alt="" />
      )}

      <div className={styles.content}>
        <h2>{title}</h2>
        <p className={styles.description}>{message}</p>

        {!compact && !checking && (
          <ol className={styles.steps}>
            {unavailable && (
              <li>
                <span>Start the server</span>
                <CopyCommand command="ollama serve" />
              </li>
            )}
            <li>
              <span>
                Chat model:{" "}
                <code className={styles.modelName}>{provider.chatModel}</code>
              </span>
              {(!hasMissingModels || missingChatModel) && (
                <CopyCommand command={`ollama pull ${provider.chatModel}`} />
              )}
            </li>
            <li>
              <span>
                Inline completion model:{" "}
                <code className={styles.modelName}>
                  {provider.completionModel}
                </code>
              </span>
              {(!hasMissingModels || missingCompletionModel) && (
                <CopyCommand
                  command={`ollama pull ${provider.completionModel}`}
                />
              )}
            </li>
          </ol>
        )}

        <div className={styles.actions}>
          {!checking && (
            <button className={styles.checkButton} onClick={onCheck}>
              Check again
            </button>
          )}
          <button className={styles.settingsButton} onClick={onOpenSettings}>
            Open Good Buddy Settings
          </button>
        </div>

        {!compact && (
          <p className={styles.endpoint}>
            Ollama endpoint: <code>{provider.endpoint}</code>
          </p>
        )}
      </div>
    </section>
  );
}

function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  };

  const title =
    status === "copied"
      ? "Command copied"
      : status === "failed"
        ? "Copy failed"
        : "Copy command";

  return (
    <div className={styles.command}>
      <code>{command}</code>
      <IconButton
        className={styles.copyButton}
        iconName={status === "copied" ? "check-icon" : "copy-icon"}
        title={title}
        onClick={handleCopy}
      />
    </div>
  );
}
