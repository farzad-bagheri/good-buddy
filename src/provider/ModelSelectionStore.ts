import { getGoodBuddyConfig, type GoodBuddyConfig } from "@/config";
import * as vscode from "vscode";

type ModelPurpose = "chat" | "completion";

interface PersistentState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export class ModelSelectionStore {
  constructor(private readonly state: PersistentState) {}

  getChatModel(): string {
    return this.getModel("chat");
  }

  getCompletionModel(): string {
    return this.getModel("completion");
  }

  async selectChatModel(model: string): Promise<void> {
    await this.state.update(this.key("chat"), model);
  }

  async selectCompletionModel(model: string): Promise<void> {
    await this.state.update(this.key("completion"), model);
  }

  private getModel(purpose: ModelPurpose): string {
    const config = getGoodBuddyConfig();
    const stored = this.state.get<string>(this.key(purpose));
    if (stored !== undefined) return stored;

    // Legacy model settings were shared and Ollama-specific; do not carry them
    // into the OpenAI-compatible provider's selection.
    if (config.provider !== "ollama") return "";
    const legacySetting =
      purpose === "chat" ? "chatModel" : "completionModel";
    const configuredModel = vscode.workspace
      .getConfiguration("goodBuddy")
      .get<string>(legacySetting, "");
    if (configuredModel) return configuredModel;
    return purpose === "chat"
      ? (this.state.get<string>("goodBuddy.selectedChatModel") ?? "")
      : "";
  }

  private key(purpose: ModelPurpose): string {
    const config = getGoodBuddyConfig();
    return `goodBuddy.model.${purpose}.${encodeURIComponent(config.provider)}.${encodeURIComponent(
      this.endpoint(config),
    )}`;
  }

  private endpoint(config: GoodBuddyConfig): string {
    return config.provider === "openai-compatible"
      ? config.openAICompatibleEndpoint
      : config.endpoint;
  }
}
