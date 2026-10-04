import { getGoodBuddyConfig, inlineCompletionsEnabled } from "@/config";
import { GoodBuddyProvider } from "@/provider";
import { ModelSelectionStore } from "@/provider/ModelSelectionStore";
import * as vscode from "vscode";
import { EXPLANATION_DEBOUNCE_MS } from "./constants";
import { getContextRanges } from "./utils";

export class InlineCompletionFeature
  implements vscode.InlineCompletionItemProvider
{
  private lastRequestId = 0;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly statusBar: vscode.StatusBarItem,
    private readonly provider: GoodBuddyProvider,
    private readonly modelSelections: ModelSelectionStore,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!inlineCompletionsEnabled()) {
      return undefined;
    }

    const requestId = ++this.lastRequestId;

    // Wait for typing to pause before hitting the model; bail out early if superseded.
    await new Promise((resolve) =>
      setTimeout(resolve, EXPLANATION_DEBOUNCE_MS),
    );
    if (requestId !== this.lastRequestId || token.isCancellationRequested) {
      return undefined;
    }

    const { maxContextLines, completionTimeoutMs } = getGoodBuddyConfig();
    const completionModel = this.modelSelections.getCompletionModel();
    if (!completionModel) return undefined;
    const context = getContextRanges(document, position, maxContextLines);
    if (!context) {
      return undefined;
    }
    const { prefix, suffix } = context;

    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, completionTimeoutMs);

    this.statusBar.text = "$(loading~spin) Good Buddy";
    this.statusBar.tooltip = `Querying ${completionModel}... (first request after idle can be slow while the model loads)`;
    const started = Date.now();

    try {
      // Instruct models don't reliably honor the generic "suffix" field, so build
      // the FIM prompt ourselves using special tokens and bypass the chat template.
      const fimPrompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
      const response = await this.provider.generate(
        {
          model: completionModel,
          prompt: fimPrompt,
          raw: true,
          keepAlive: "30m",
          options: {
            temperature: 0.2,
            num_predict: 128,
            stop: [
              // Stop sequences for the model to know when to end the completion
              "\n\n",
              "```",
              "<|fim_prefix|>",
              "<|fim_suffix|>",
              "<|fim_middle|>",
              "<|endoftext|>",
            ],
          },
        },
        controller.signal,
      );

      // Stale response from a superseded keystroke; drop it.
      if (requestId !== this.lastRequestId || token.isCancellationRequested) {
        return undefined;
      }

      const text = response.replace(/\r/g, ""); // Normalize line endings to Unix style
      const elapsedMs = Date.now() - started;
      this.output.appendLine(
        `[${new Date().toISOString()}] model=${completionModel} elapsed=${elapsedMs}ms\n` +
          `  prefix tail: ...${JSON.stringify(prefix.slice(-80))}\n` +
          `  suggestion: ${JSON.stringify(text)}`,
      );

      if (!text) {
        this.statusBar.text = "$(circle-large-outline) Good Buddy";
        this.statusBar.tooltip = "Good Buddy: no suggestion";
        return undefined;
      }

      this.statusBar.text = "$(sparkle) Good Buddy";
      this.statusBar.tooltip = `Good Buddy suggested via ${completionModel} (${elapsedMs}ms). Click to view log.`;

      return [
        new vscode.InlineCompletionItem(
          text,
          new vscode.Range(position, position),
        ),
      ];
    } catch (err) {
      // Cancelled because a newer keystroke superseded this request; not a real error.
      if (
        !timedOut &&
        (controller.signal.aborted || token.isCancellationRequested)
      ) {
        return undefined;
      }

      const message = timedOut
        ? `timed out after ${completionTimeoutMs}ms (model may still be loading; try again shortly, or raise goodBuddy.completionTimeoutMs)`
        : (err as Error).message;
      this.statusBar.text = "$(error) Good Buddy";
      this.statusBar.tooltip = `Good Buddy error: ${message}`;
      this.output.appendLine(`[${new Date().toISOString()}] ERROR: ${message}`);
      console.error("Good Buddy completion error:", err);
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }
}
