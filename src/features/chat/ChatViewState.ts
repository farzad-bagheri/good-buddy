import { getGoodBuddyConfig } from "@/config";
import { GoodBuddyProvider, ProviderModel } from "@/provider";
import { ModelSelectionStore } from "@/provider/ModelSelectionStore";
import { Resources } from "@/resources";
import * as vscode from "vscode";
import { AttachmentStore } from "./attachment";
import { findMissingModels, getModelSetupStatus } from "./utils";

/**
 * Manages the state of the chat view, including model selections, attachments,
 * and provider status. It communicates with the webview to keep it updated
 * with the current state.
 */
export class ChatViewState {
  readonly attachments = new AttachmentStore();
  private modelListRequest = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly provider: GoodBuddyProvider,
    private readonly modelSelections: ModelSelectionStore,
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
    return this.modelSelections.getChatModel();
  }

  async selectModel(model: unknown): Promise<void> {
    if (typeof model !== "string") return;
    await this.modelSelections.selectChatModel(model);
    await this.sendModelList();
  }

  async selectCompletionModel(model: unknown): Promise<void> {
    if (typeof model !== "string") return;
    await this.modelSelections.selectCompletionModel(model);
    await this.sendModelList();
  }

  async sendModelList(): Promise<void> {
    const requestId = ++this.modelListRequest;
    this.postProviderStatus("checking");
    try {
      const models = await this.provider.listModels();
      if (requestId !== this.modelListRequest) return;
      this.getWebview()?.postMessage({
        type: "vsc:models",
        models,
        selected: this.getSelectedModel(),
      });
      const chatModel = this.modelSelections.getChatModel();
      const completionModel = this.modelSelections.getCompletionModel();
      const availableModels = models.map(({ model }) => model);
      const selectedModels = [chatModel, completionModel].filter(Boolean);
      const missingModels = findMissingModels(
        availableModels,
        selectedModels,
      );
      const status = getModelSetupStatus(availableModels, [
        chatModel,
        completionModel,
      ]);
      this.postProviderStatus(status, missingModels, {
        chatModel,
        completionModel,
      });
    } catch (error) {
      if (requestId !== this.modelListRequest) return;
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

  attachSelection(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage(
        "Good Buddy: open a file and select code to attach it.",
      );
      return;
    }
    if (editor.selection.isEmpty) {
      void vscode.window.showInformationMessage(
        "Good Buddy: select code in the editor before attaching it.",
      );
      return;
    }

    const { document, selection } = editor;
    const startLine = selection.start.line + 1;
    const endLine =
      selection.end.line + (selection.end.character === 0 ? 0 : 1);
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const basename = document.uri.path.split("/").pop() || document.fileName;
    const lineLabel =
      startLine === endLine
        ? `line ${startLine}`
        : `lines ${startLine}-${endLine}`;
    const contextPath = `${relativePath} (selection, ${lineLabel})`;
    this.attachments.addSelection(
      `${basename} (selection, ${lineLabel})`,
      contextPath,
      relativePath,
      document.getText(selection),
    );
    this.postAttachments();
  }

  excludeActiveDocument(): void {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.uri.scheme !== "file") return;

    this.attachments.excludeActiveDocument(
      vscode.workspace.asRelativePath(document.uri),
    );
    this.postAttachments();
  }

  addImageAttachment(name: string, mimeType: string, data: string): void {
    this.attachments.addImageBase64(name, mimeType, data);
    this.postAttachments();
  }

  removeImageAttachment(id: string): void {
    this.attachments.removeImage(id);
    this.postAttachments();
  }

  postAttachments(): void {
    const activeDocument = this.attachments.activeDocumentAttachment();
    this.getWebview()?.postMessage({
      type: "vsc:attachments",
      attached: this.attachments.allBase,
      images: this.attachments.images.map(({ id, name }) => ({ id, name })),
      activeDocument,
    });
  }

  private postProviderStatus(
    status:
      | "checking"
      | "unavailable"
      | "no-models"
      | "models-unselected"
      | "models-missing"
      | "ready",
    missingModels: string[] = [],
    selection?: { chatModel: string; completionModel: string },
  ): void {
    const webview = this.getWebview();
    if (!webview) return;
    const config = getGoodBuddyConfig();
    webview.postMessage({
      type: "vsc:providerStatus",
      status,
      provider: config.provider,
      endpoint:
        config.provider === "openai-compatible"
          ? config.openAICompatibleEndpoint
          : config.endpoint,
      chatModel: selection?.chatModel ?? this.modelSelections.getChatModel(),
      completionModel:
        selection?.completionModel ??
        this.modelSelections.getCompletionModel(),
      missingModels,
      artworkUri: this.resources
        .getIcon("provider-offline")
        .asWebUri(webview)
        .toString(),
    });
  }
}
