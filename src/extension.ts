import * as vscode from "vscode";
import { InlineCompletionFeature } from "@/features/completion";
import { ChatFeature } from "@/features/chat";
import { ExplainCodeFeature } from "@/features/explain";
import { toggleInlineCompletions } from "./config";
import { ConfiguredProvider } from "@/provider/ConfiguredProvider";
import { ModelSelectionStore } from "@/provider/ModelSelectionStore";

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

  const provider = new ConfiguredProvider();
  const modelSelections = new ModelSelectionStore(context.globalState);
  const explainCodeFeature = new ExplainCodeFeature(
    context,
    provider,
    modelSelections,
  );
  const inlineCompletionFeature = new InlineCompletionFeature(
    output,
    statusBar,
    provider,
    modelSelections,
  );
  const chatFeature = new ChatFeature(
    context,
    output,
    provider,
    modelSelections,
  );

  context.subscriptions.push(
    output,
    statusBar,
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      inlineCompletionFeature,
    ),

    vscode.window.registerWebviewViewProvider(
      ChatFeature.viewType,
      chatFeature,
    ),

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
