import * as vscode from "vscode";
import { GoodBuddyInlineCompletionProvider } from "@/features/completion/inlineCompletionProvider";
import { GoodBuddyChatViewProvider } from "@/features/chat/chatViewProvider";
import { explainCode } from "@/features/explain/explainCode";
import { toggleInlineCompletions } from "./config";

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

  const provider = new GoodBuddyInlineCompletionProvider(output, statusBar);
  const chatViewProvider = new GoodBuddyChatViewProvider(context, output);

  context.subscriptions.push(
    output,
    statusBar,
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      provider,
    ),

    vscode.window.registerWebviewViewProvider(
      GoodBuddyChatViewProvider.viewType,
      chatViewProvider,
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
      await explainCode(editor);
    }),

    vscode.commands.registerCommand(
      "goodBuddy.toggleInlineCompletions",
      toggleInlineCompletions,
    ),
  );
}

export function deactivate(): void {}
