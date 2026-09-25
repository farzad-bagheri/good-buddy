import * as path from "path";
import * as vscode from "vscode";
import { MAX_OUTPUT_LENGTH } from "../constants";

/**
 * Resolves a workspace-relative file path to an absolute URI, ensuring it stays within the workspace.
 * @param root The root directory of the workspace.
 * @param relativePath The relative path to the file within the workspace.
 * @returns The absolute URI of the resolved file within the workspace.
 */
export function workspaceFile(root: string, relativePath: string): vscode.Uri {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Tool paths must stay inside the opened workspace.");
  }
  return vscode.Uri.file(resolved);
}

/**
 * Ensures that the given value is a non-empty string, throwing an error if it is not.
 * @param value The value to check.
 * @param name The name of the argument, used in the error message.
 * @returns The validated non-empty string.
 */
export function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`Tool argument '${name}' must be a non-empty string.`);
  return value;
}

/**
 * Truncates the given string to a maximum length defined by MAX_OUTPUT_LENGTH, appending a truncation notice if necessary.
 * @param value The string to truncate.
 * @returns The truncated string if it exceeds the maximum length, otherwise the original string.
 */
export function truncate(value: string): string {
  return value.length > MAX_OUTPUT_LENGTH
    ? `${value.slice(0, MAX_OUTPUT_LENGTH)}\n…[truncated]`
    : value;
}

/**
 * Reads the content of a file if it exists, returning an empty string if the file is not found.
 * @param uri The URI of the file to read.
 * @returns The content of the file as a string, or an empty string if the file does not exist.
 */
export async function readTextIfExists(uri: vscode.Uri): Promise<string> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString(
      "utf8",
    );
  } catch (error) {
    if (
      error instanceof vscode.FileSystemError &&
      error.code === "FileNotFound"
    )
      return "";
    throw error;
  }
}

/**
 * Creates a unified diff for the given file content before and after changes.
 * @param relativePath The relative path of the file being diffed.
 * @param before The content of the file before the change.
 * @param after The content of the file after the change.
 * @returns A unified diff string representing the changes between the before and after content.
 */
export function createDiff(
  relativePath: string,
  before: string,
  after: string,
): string {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");

  // Find the common prefix of the old and new lines.
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++;

  // Find the common suffix of the old and new lines.
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  )
    suffix++;

  const oldChanged = oldLines.slice(prefix, oldLines.length - suffix);
  const newChanged = newLines.slice(prefix, newLines.length - suffix);

  const contextBefore = oldLines
    .slice(Math.max(0, prefix - 3), prefix)
    .map((line) => ` ${line}`);

  const contextAfter = oldLines
    .slice(oldLines.length - suffix, oldLines.length - suffix + 3)
    .map((line) => ` ${line}`);

  return [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    ...contextBefore,
    ...oldChanged.map((line) => `-${line}`),
    ...newChanged.map((line) => `+${line}`),
    ...contextAfter,
  ].join("\n");
}
