import { getGoodBuddyConfig } from "@/config";
import { GoodBuddyProvider } from "@/provider";
import { marked } from "marked";
import * as vscode from "vscode";
import { shellHtml } from "./shell";
import { Resources } from "@/resources/Resources";

export class ExplainCodeFeature {
    private readonly resources: Resources;
    
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly provider: GoodBuddyProvider,
  ) {
     this.resources = new Resources(context);
  }

  async explainCode(editor: vscode.TextEditor): Promise<void> {
    const { chatModel } = getGoodBuddyConfig();

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
    
  const iconUri = (name: string) =>
      this.resources.getIcon(name).asWebUri(panel.webview).toString();
    panel.webview.html = shellHtml(iconUri);

    const controller = new AbortController();
    panel.onDidDispose(() => controller.abort());

    try {
      let fullExplanation = "";
      await this.provider.chatStream(
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
        (chunk) => {
          fullExplanation += chunk;
          panel.webview.postMessage({ type: "vsc:chunk", text: chunk });
        },
        controller.signal,
      );

      const html = marked.parse(fullExplanation);
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
