import { useEffect, useRef } from "react";
import type { ProviderModel, ProviderStatusInfo } from "../../types";
import styles from "./ProviderSetupDialog.module.css";

interface ProviderSetupDialogProps {
  provider: ProviderStatusInfo;
  models: ProviderModel[];
  onClose: () => void;
  onCheck: () => void;
  onSelectChatModel: (model: string) => void;
  onSelectCompletionModel: (model: string) => void;
  onOpenSettings: () => void;
}

export function ProviderSetupDialog({
  provider,
  models,
  onClose,
  onCheck,
  onSelectChatModel,
  onSelectCompletionModel,
  onOpenSettings,
}: ProviderSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const checking = provider.status === "checking";
  const isOllama = provider.provider === "ollama";
  const providerName = isOllama ? "Ollama" : "OpenAI-compatible server";

  const message = (() => {
    switch (provider.status) {
      case "checking":
        return `Connecting to ${providerName}...`;
      case "unavailable":
        return "Check that the server is running and the configured endpoint is correct.";
      case "no-models":
        return isOllama
          ? "Ollama is connected but has no downloaded models. Download a model, then refresh."
          : "The server is connected but returned no models. Load or enable a model, then refresh.";
      case "models-unselected":
        return "Select a model for chat and a model for inline code completions.";
      case "models-missing":
        return `One or more selected models are unavailable from this ${providerName}. Choose replacements below.`;
      case "ready":
        return "Your provider and model selections are ready.";
    }
  })();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="provider-setup-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <header className={styles.header}>
        <div>
          <h2 id="provider-setup-title">Provider and models</h2>
          <p>{providerName}</p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={close}
          aria-label="Close setup"
        >
          ×
        </button>
      </header>

      <p className={styles.message} role="status">
        {message}
      </p>

      {provider.status === "no-models" && isOllama && (
        <p className={styles.help}>
          Download a model with Ollama, then select <strong>Refresh models</strong>.
        </p>
      )}
      {provider.status === "models-missing" && (
        <p className={styles.help}>
          Unavailable: {provider.missingModels.join(", ")}
          {isOllama && " — download replacements with ollama pull <model>."}
        </p>
      )}

      {models.length > 0 && (
        <div className={styles.modelSelections}>
          <ModelSelect
            id="setup-chat-model"
            label="Chat model"
            value={provider.chatModel}
            models={models}
            onChange={onSelectChatModel}
          />
          <ModelSelect
            id="setup-completion-model"
            label="Inline completion model"
            value={provider.completionModel}
            models={models}
            onChange={onSelectCompletionModel}
          />
        </div>
      )}

      <p className={styles.endpoint}>
        {providerName} endpoint: <code>{provider.endpoint}</code>
      </p>

      <footer className={styles.actions}>
        <button type="button" onClick={onOpenSettings}>
          Provider settings
        </button>
        <span className={styles.spacer} />
        <button type="button" onClick={close}>
          Close
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onCheck}
          disabled={checking}
        >
          {checking ? "Checking..." : "Refresh models"}
        </button>
      </footer>
    </dialog>
  );
}

interface ModelSelectProps {
  id: string;
  label: string;
  value: string;
  models: ProviderModel[];
  onChange: (model: string) => void;
}

function ModelSelect({
  id,
  label,
  value,
  models,
  onChange,
}: ModelSelectProps) {
  return (
    <label className={styles.modelPicker} htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a model</option>
        {value && !models.some(({ model }) => model === value) && (
          <option value={value} disabled>
            Unavailable: {value}
          </option>
        )}
        {models.map((model) => (
          <option key={model.model} value={model.model}>
            {model.caption}
          </option>
        ))}
      </select>
    </label>
  );
}
