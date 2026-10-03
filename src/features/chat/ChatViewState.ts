import { getGoodBuddyConfig } from "@/config";
import { GoodBuddyProvider, ProviderModel } from "@/provider";
import { Resources } from "@/resources";
import * as vscode from "vscode";
import { AttachmentStore } from "./attachment";
import { findMissingModels } from "./utils";

const MODEL_STATE_KEY = "goodBuddy.selectedChatModel";

export class ChatViewState {
  readonly attachments = new AttachmentStore();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly provider: GoodBuddyProvider,
    private readonly resources: Resources,
    private readonly output: vscode.OutputChannel,
    private readonly getWebview: () => vscode.Webview | undefined,
  ) {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.postAttachments()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("goodBuddy")) {
          void this.sendModelList();
        }
      }),
    );
  }

  getSelectedModel(): string {
    return this.context.globalState.get<string>(
      MODEL_STATE_KEY,
      getGoodBuddyConfig().chatModel,
    );
  }

  async selectModel(model: unknown): Promise<void> {
    await this.context.globalState.update(MODEL_STATE_KEY, model);
    await this.sendModelList();
  }

  async sendModelList(): Promise<void> {
    this.postProviderStatus("checking");
    try {
      const models = await this.provider.listModels();
      this.getWebview()?.postMessage({
        type: "vsc:models",
        models,
        selected: this.getSelectedModel(),
      });
      const missingModels = findMissingModels(
        models.map(({ model }) => model),
        [this.getSelectedModel(), getGoodBuddyConfig().completionModel],
      );
      this.postProviderStatus(
        missingModels.length ? "models-missing" : "ready",
        missingModels,
      );
    } catch (error) {
      this.output.appendLine(`Good Buddy chat: failed to list models: ${error}`);
      this.getWebview()?.postMessage({
        type: "vsc:models",
        models: [],
        selected: this.getSelectedModel(),
      });
      this.postProviderStatus("unavailable");
    }
  }

  async modelDetails(model: string): Promise<ProviderModel | null> {
    try {
      const models = await this.provider.listModels();
      return models.find((candidate) => candidate.model === model) ?? null;
    } catch (error) {
      this.output.appendLine(`Good Buddy chat: failed to list models: ${error}`);
      return null;
    }
  }

  async pickAttachments(): Promise<void> {
    await this.attachments.pick();
    this.postAttachments();
  }

  postAttachments(): void {
    const activeDocument = this.attachments.activeDocumentAttachment();
    this.getWebview()?.postMessage({
      type: "vsc:attachments",
      attached: this.attachments.allBase,
      activeDocument,
    });
  }

  private postProviderStatus(
    status: "checking" | "unavailable" | "models-missing" | "ready",
    missingModels: string[] = [],
  ): void {
    const webview = this.getWebview();
    if (!webview) return;
    const config = getGoodBuddyConfig();
    webview.postMessage({
      type: "vsc:providerStatus",
      status,
      endpoint: config.endpoint,
      chatModel: config.chatModel,
      completionModel: config.completionModel,
      missingModels,
      artworkUri: this.resources
        .getIcon("provider-offline")
        .asWebUri(webview)
        .toString(),
    });
  }
}
