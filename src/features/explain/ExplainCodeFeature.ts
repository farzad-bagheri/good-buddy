import { GoodBuddyProvider } from "@/provider";
import { ModelSelectionStore } from "@/provider/ModelSelectionStore";
import { Resources } from "@/resources";
import { marked } from "marked";
import * as vscode from "vscode";
import { shellHtml } from "./shell";

export class ExplainCodeFeature {
    private readonly resources: Resources;
    
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly provider: GoodBuddyProvider,
    private readonly modelSelections: ModelSelectionStore,
  ) {
     this.resources = new Resources(context);
  }

  async explainCode(editor: vscode.TextEditor): Promise<void> {
    const chatModel = this.modelSelections.getChatModel();
    if (!chatModel) {
      vscode.window.showInformationMessage(
        "Good Buddy: select a chat model in the chat view first.",
      );
      return;
    }

    const selection = editor.selection;
    const code = editor.document.getText(
      selection.isEmpty ? undefined : selection,
    );

    if (!code.trim()) {
      vscode.window.showInformationMessage(
        "Good Buddy: select some code to explain.",
      );
      return;
    }

    const language = editor.document.languageId;

    const panel = vscode.window.createWebviewPanel(
      "goodBuddyExplain",
      "Good Buddy: Explanation",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      },
    );
    
    panel.webview.html = shellHtml();

    const controller = new AbortController();
    panel.onDidDispose(() => controller.abort());

    try {
     const explanation = await this.provider.chat(
        {
          model: chatModel,
          messages: [
            {
              role: "system",
              content:
                "You are a concise coding assistant. Explain the given code clearly and briefly. You return explanation in markdown.",
            },
            {
              role: "user",
              content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``,
            },
          ],
        },
        controller.signal,
      );

      const html = marked.parse(explanation);
      panel.webview.postMessage({ type: "vsc:done", text: html });
    } catch (err) {
      if (!controller.signal.aborted) {
        panel.webview.postMessage({
          type: "vsc:error",
          text: (err as Error).message,
        });
      }
    }
  }
}
