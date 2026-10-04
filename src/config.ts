import * as vscode from "vscode";

export interface GoodBuddyConfig {
  provider: "ollama" | "openai-compatible";
  /**
   * The endpoint URL of the LLM server, combining the protocol, host, and port.
   */
  endpoint: string;
  openAICompatibleEndpoint: string;
  openAICompatibleApiKey: string;
  /**
   * The maximum number of context lines to consider.
   */
  maxContextLines: number;
  /**
   * How long to wait for an inline completion before giving up, in milliseconds.
   */
  completionTimeoutMs: number;
}

export function getGoodBuddyConfig(): GoodBuddyConfig {
  const configuration = vscode.workspace.getConfiguration("goodBuddy");
  const provider = configuration.get<GoodBuddyConfig["provider"]>(
    "provider",
    "openai-compatible",
  );
  return {
    provider,
    endpoint: configuration.get<string>("endpoint", "http://localhost:11434"),
    openAICompatibleEndpoint: configuration.get<string>(
      "openAICompatibleEndpoint",
      "http://localhost:1234/v1",
    ),
    openAICompatibleApiKey: configuration.get<string>(
      "openAICompatibleApiKey",
      "",
    ),
    maxContextLines: configuration.get<number>("maxContextLines", 100),
    completionTimeoutMs: configuration.get<number>(
      "completionTimeoutMs",
      30000,
    ),
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
