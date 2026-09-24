import * as vscode from "vscode";
import { getGoodBuddyConfig, inlineCompletionsEnabled } from "@/config";
import { OllamaClient } from "@/provider/ollama";

// Uses Ollama's FIM-style prompt: give prefix/suffix and let the model fill the middle.
export class GoodBuddyInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private lastRequestId = 0;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly statusBar: vscode.StatusBarItem,
    private readonly debounceMs = 250,
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
    await new Promise((resolve) => setTimeout(resolve, this.debounceMs));
    if (requestId !== this.lastRequestId || token.isCancellationRequested) {
      return undefined;
    }

    const { endpoint, completionModel, maxContextLines } = getGoodBuddyConfig();

    const startLine = Math.max(0, position.line - maxContextLines);
    const prefixRange = new vscode.Range(
      startLine,
      0,
      position.line,
      position.character,
    );
    const endLine = Math.min(
      document.lineCount - 1,
      position.line + maxContextLines,
    );
    const suffixEndPos = document.lineAt(endLine).range.end;
    const suffixRange = new vscode.Range(position, suffixEndPos);

    const prefix = document.getText(prefixRange);
    const suffix = document.getText(suffixRange);

    if (!prefix.trim() && !suffix.trim()) {
      return undefined;
    }

    const client = new OllamaClient(endpoint);
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8000);

    this.statusBar.text = "$(loading~spin) Good Buddy";
    this.statusBar.tooltip = `Querying ${completionModel}... (first request after idle can be slow while the model loads)`;
    const started = Date.now();

    try {
      // Instruct models don't reliably honor the generic "suffix" field, so build
      // the FIM prompt ourselves using Qwen's special tokens and bypass the chat template.
      const fimPrompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
      const response = await client.generate(
        {
          model: completionModel,
          prompt: fimPrompt,
          raw: true,
          keepAlive: "30m",
          options: {
            temperature: 0.2,
            num_predict: 128,
            stop: [
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

      const text = response.replace(/\r/g, "");
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
        ? "timed out after 8s (model may still be loading; try again shortly)"
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
