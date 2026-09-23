import * as vscode from "vscode";

export interface GoodBuddyConfig {
  endpoint: string;
  chatModel: string;
  completionModel: string;
  /**
   * The maximum number of context lines to consider.
   */
  maxContextLines: number;
}

export function getGoodBuddyConfig(): GoodBuddyConfig {
  const configuration = vscode.workspace.getConfiguration("goodBuddy");
  return {
    endpoint: configuration.get<string>("endpoint", "http://localhost:11434"),
    chatModel: configuration.get<string>("chatModel", "<invalid>"),
    completionModel: configuration.get<string>("completionModel", "<invalid>"),
    maxContextLines: configuration.get<number>("maxContextLines", 100),
  };
}

export function inlineCompletionsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("goodBuddy")
    .get<boolean>("inlineCompletionsEnabled", true);
}

export async function toggleInlineCompletions(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("goodBuddy");
  const current = cfg.get<boolean>("inlineCompletionsEnabled", true);
  
  await cfg.update(
    "inlineCompletionsEnabled",
    !current,
    vscode.ConfigurationTarget.Global,
  );

  vscode.window.showInformationMessage(
    `Good Buddy: inline completions ${!current ? "enabled" : "disabled"}.`,
  );
}
