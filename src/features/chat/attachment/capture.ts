import * as vscode from "vscode";
import { MAX_ATTACHMENT_BYTES } from "../constants";

const MAX_PROBLEMS = 50;

/** Keeps the end of the text, where errors usually are, within the byte limit. */
export function tailWithinBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const marker = "[...earlier output truncated...]\n";
  const budget = maxBytes - Buffer.byteLength(marker, "utf8");
  let tail = Buffer.from(text, "utf8").subarray(-budget).toString("utf8");
  // Drop a possibly broken first character and the partial first line.
  tail = tail.replace(/^[^\n]*\n/, "");
  return marker + tail;
}

export function cleanTerminalText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * VS Code has no stable API to read terminal output, so select the whole
 * buffer, copy it, then restore the user's clipboard.
 */
export async function captureTerminalText(): Promise<{
  name: string;
  content: string;
} | null> {
  const terminal = vscode.window.activeTerminal;
  if (!terminal) return null;

  const previousClipboard = await vscode.env.clipboard.readText();
  try {
    await vscode.env.clipboard.writeText("");
    terminal.show(false);
    await vscode.commands.executeCommand(
      "workbench.action.terminal.selectAll",
    );
    await vscode.commands.executeCommand(
      "workbench.action.terminal.copySelection",
    );
    const copied = await vscode.env.clipboard.readText();
    await vscode.commands.executeCommand(
      "workbench.action.terminal.clearSelection",
    );
    const content = tailWithinBytes(
      cleanTerminalText(copied),
      MAX_ATTACHMENT_BYTES,
    );
    return { name: terminal.name, content };
  } finally {
    await vscode.env.clipboard.writeText(previousClipboard);
  }
}

const SEVERITY_LABELS: Partial<Record<vscode.DiagnosticSeverity, string>> = {
  [vscode.DiagnosticSeverity.Error]: "error",
  [vscode.DiagnosticSeverity.Warning]: "warning",
};

/** Formats errors and warnings from the Problems panel, errors first. */
export function formatProblems(
  entries: readonly [vscode.Uri, readonly vscode.Diagnostic[]][],
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): { content: string; total: number } {
  const rows = entries.flatMap(([uri, diagnostics]) =>
    diagnostics
      .filter((d) => SEVERITY_LABELS[d.severity] !== undefined)
      .map((d) => {
        const code =
          d.code === undefined
            ? ""
            : ` ${typeof d.code === "object" ? d.code.value : d.code}`;
        const source = d.source ? ` (${d.source}${code})` : "";
        return {
          severity: d.severity,
          text: `${vscode.workspace.asRelativePath(uri)}:${d.range.start.line + 1}:${d.range.start.character + 1} ${SEVERITY_LABELS[d.severity]}: ${d.message.split("\n")[0]}${source}`,
        };
      }),
  );
  rows.sort((a, b) => a.severity - b.severity);

  const lines: string[] = [];
  let bytes = 0;
  for (const row of rows.slice(0, MAX_PROBLEMS)) {
    bytes += Buffer.byteLength(row.text, "utf8") + 1;
    if (bytes > maxBytes) break;
    lines.push(row.text);
  }
  if (lines.length < rows.length) {
    lines.push(`...and ${rows.length - lines.length} more not shown`);
  }
  return { content: lines.join("\n"), total: rows.length };
}
