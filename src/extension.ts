import * as vscode from "vscode";
import { GoodBuddyInlineCompletionFeature } from "@/features/completion";
import { GoodBuddyChatViewProvider } from "@/features/chat/chatViewProvider";
import { ExplainCodeFeature } from "@/features/explain";
import { toggleInlineCompletions } from "./config";
import { OllamaProvider } from "@/provider/ollama";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Good Buddy");

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.text = "$(circle-large-outline) Good Buddy";
  statusBar.tooltip = "Good Buddy is idle. Click to open chat.";
  statusBar.command = "workbench.view.extension.goodBuddy";
  statusBar.show();

  const ollamaProvider = new OllamaProvider();
  const explainCodeFeature = new ExplainCodeFeature(ollamaProvider);
  const inlineCompletionFeature = new GoodBuddyInlineCompletionFeature(output, statusBar, ollamaProvider);
  // const chatViewProvider = new GoodBuddyChatViewProvider(context, output);

  context.subscriptions.push(
    output,
    statusBar,
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      inlineCompletionFeature,
    ),

    // vscode.window.registerWebviewViewProvider(
    //   GoodBuddyChatViewProvider.viewType,
    //           chatViewProvider,
    //         ),

    vscode.commands.registerCommand("goodBuddy.showOutput", () => {
      output.show(true);
    }),

    vscode.commands.registerCommand("goodBuddy.explainCode", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          "Good Buddy: open a file and select code first.",
        );
        return;
      }
      await explainCodeFeature.explainCode(editor);
    }),

    vscode.commands.registerCommand(
      "goodBuddy.toggleInlineCompletions",
      toggleInlineCompletions,
    ),
  );
}

export function deactivate(): void {}
