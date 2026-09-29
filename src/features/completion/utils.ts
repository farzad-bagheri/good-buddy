import * as vscode from "vscode";

export const getContextRanges = (
  document: vscode.TextDocument,
  position: vscode.Position,
  maxContextLines: number,
) => {
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
  return { prefix, suffix };
};
