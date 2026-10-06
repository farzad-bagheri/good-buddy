import { exec } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import {
  MAX_LIST_PROJECT_DEPTH,
  MAX_LIST_PROJECT_ITEMS,
  MAX_OUTPUT_LENGTH,
  TOOL_TIMEOUT,
  MAX_SEARCH_RESULTS,
  MAX_SEARCH_FILES,
  MAX_SEARCH_FILE_BYTES,
  SEARCH_EXCLUDES,
} from "../constants";
import type { ToolCall, ToolDefinition } from "../types";
import {
  createDiff,
  readTextIfExists,
  requiredString,
  truncate,
  workspaceFile,
} from "./utils";

export interface WriteProposal {
  path: string;
  diff: string;
}

/**
 * Provides a set of tools for interacting with the workspace, including listing project files,
 * reading and writing files, and running commands.
 */
export class WorkspaceTools {
  /**
   * Creates a set of tools for interacting with the workspace.
   * @param executeWrite A function to execute write operations in the workspace.
   * @param executeCommand A function to execute commands in the workspace.
   * @returns An array of tool definitions for interacting with the workspace.
   */
  createTools(
    executeWrite: (call: ToolCall) => Promise<string>,
    executeCommand: (call: ToolCall) => Promise<string>,
  ): ToolDefinition[] {
    return [
      {
        id: "list_project",
        description:
          "List files under a workspace folder. Optional arguments: path (relative subfolder, defaults to the workspace root) and depth (1-5, defaults to 3).",
        execute: async (call) =>
          this.listProject(
            this.workspaceRoot(),
            this.optionalPath(call.arguments.path),
            this.optionalDepth(call.arguments.depth),
          ),
      },
      {
        id: "search_files",
        description:
          "Find workspace files using a glob pattern (for example **/*.ts or **/*Config*). Optional limit defaults to 50.",
        execute: async (call) =>
          this.searchFiles(
            this.workspaceRoot(),
            requiredString(call.arguments.pattern, "pattern"),
            this.optionalLimit(call.arguments.limit),
          ),
      },
      {
        id: "search_file_contents",
        description:
          "Search text within workspace files. Required query; optional path glob, caseSensitive, contextLines (0-3), and limit (default 50).",
        execute: async (call) =>
          this.searchFileContents(
            this.workspaceRoot(),
            requiredString(call.arguments.query, "query"),
            this.optionalGlob(call.arguments.path),
            call.arguments.caseSensitive === true,
            this.optionalContextLines(call.arguments.contextLines),
            this.optionalLimit(call.arguments.limit),
          ),
      },
      {
        id: "read_file",
        description: "Read a text file from the workspace.",
        execute: async (call) =>
          this.readFile(
            this.workspaceRoot(),
            requiredString(call.arguments.path, "path"),
          ),
      },
      {
        id: "get_diagnostics",
        description:
          "Get VS Code errors and warnings for the workspace or one workspace-relative file. Optional argument: path.",
        execute: async (call) =>
          this.getDiagnostics(
            this.workspaceRoot(),
            this.optionalPath(call.arguments.path),
          ),
      },
      {
        id: "find_references",
        description:
          "Find symbol references at a workspace file position. Required arguments: path and 1-based line and character.",
        execute: async (call) =>
          this.findReferences(
            this.workspaceRoot(),
            requiredString(call.arguments.path, "path"),
            this.requiredPositiveInteger(call.arguments.line, "line"),
            this.requiredPositiveInteger(call.arguments.character, "character"),
          ),
      },
      {
        id: "write_file",
        description:
          "Propose complete file contents. Required arguments: path (workspace-relative string) and content (string; use the exact key 'content').",
        execute: executeWrite,
      },
      {
        id: "replace_in_file",
        description:
          "Propose a localized replacement in a workspace file. Required arguments: path (workspace-relative string), oldText (the exact, unique text copied from read_file), and newText (replacement text). Use only when the exact section is known and the change is small; for structural or broad changes, use write_file with the complete updated file instead.",
        execute: executeWrite,
      },
      {
        id: "delete_file",
        description:
          "Move one workspace file to the OS trash after an explicit VS Code confirmation. Never auto-approve this operation.",
        execute: async (call) =>
          this.deleteFile(requiredString(call.arguments.path, "path")),
      },
      {
        id: "run_command",
        description:
          "Run a command in the workspace after user approval, unless auto-approved.",
        execute: executeCommand,
      },
    ];
  }

  /**
   * Lists files under a workspace folder, scoped to an optional relative subfolder and depth.
   * @param root The root directory of the workspace.
   * @param startRelative The relative subfolder to start listing from (empty for the workspace root).
   * @param maxDepth The maximum number of nested levels to list, relative to the start folder.
   * @returns A string representing the project tree rooted at the start folder, up to the given depth.
   */
  private async listProject(
    root: string,
    startRelative = "",
    maxDepth = MAX_LIST_PROJECT_DEPTH,
  ): Promise<string> {
    const startUri = workspaceFile(root, startRelative || ".");
    const entries: string[] = [];
    const visit = async (
      folder: vscode.Uri,
      relative: string,
      depth: number,
    ) => {
      if (depth > maxDepth || entries.length >= MAX_LIST_PROJECT_ITEMS) return;

      for (const [name, type] of await vscode.workspace.fs.readDirectory(
        folder,
      )) {
        if (["node_modules", ".git", "out", "dist"].includes(name)) continue;

        const childRelative = relative ? `${relative}/${name}` : name;
        entries.push(
          type === vscode.FileType.Directory
            ? `${childRelative}/`
            : childRelative,
        );
        if (type === vscode.FileType.Directory) {
          await visit(
            vscode.Uri.joinPath(folder, name),
            childRelative,
            depth + 1,
          );
        }
      }
    };

    await visit(startUri, startRelative, 0);
    return entries.join("\n") || "The folder is empty.";
  }

  /**
   * Normalizes an optional tool argument into a workspace-relative path, or the workspace root if absent.
   * @param value The raw argument value provided by the model.
   * @returns A relative path string, defaulting to an empty string (the workspace root).
   */
  private optionalPath(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  /**
   * Normalizes an optional tool argument into a listing depth, clamped to a safe range.
   * @param value The raw argument value provided by the model.
   * @returns A depth between 1 and 5, defaulting to 3 when unspecified or invalid.
   */
  private optionalDepth(value: unknown): number {
    const depth = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(depth)) return 3;
    return Math.min(5, Math.max(1, Math.round(depth)));
  }

  private optionalLimit(value: unknown): number {
    const limit = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(limit)) return MAX_SEARCH_RESULTS;
    return Math.min(MAX_SEARCH_RESULTS, Math.max(1, Math.floor(limit)));
  }

  private optionalContextLines(value: unknown): number {
    const lines = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(lines)) return 1;
    return Math.min(3, Math.max(0, Math.floor(lines)));
  }

  private requiredPositiveInteger(value: unknown, name: string): number {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      throw new Error(`Tool argument '${name}' must be a positive integer.`);
    }
    return number;
  }

  private optionalGlob(value: unknown): string {
    const pattern = typeof value === "string" ? value.trim() : "**/*";
    const normalized = pattern.replaceAll("\\", "/");
    if (
      normalized.startsWith("/") ||
      /^[A-Za-z]:/.test(normalized) ||
      normalized.split("/").includes("..")
    ) {
      throw new Error("Search patterns must stay inside the opened workspace.");
    }
    return normalized || "**/*";
  }

  private async searchFiles(
    root: string,
    pattern: string,
    limit: number,
  ): Promise<string> {
    if (!pattern.trim()) throw new Error("Search pattern must not be empty.");
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(
        vscode.Uri.file(root),
        this.optionalGlob(pattern),
      ),
      SEARCH_EXCLUDES,
      limit + 1,
    );
    const results = files
      .slice(0, limit)
      .map((uri) => path.relative(root, uri.fsPath).split(path.sep).join("/"));
    if (results.length === 0) return "No files matched that pattern.";
    return truncate(
      `${results.join("\n")}${files.length > limit ? "\n[More matches omitted]" : ""}`,
    );
  }

  private async searchFileContents(
    root: string,
    query: string,
    pattern: string,
    caseSensitive: boolean,
    contextLines: number,
    limit: number,
  ): Promise<string> {
    query = query.trim();
    if (!query) throw new Error("Search query must not be empty.");
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(vscode.Uri.file(root), pattern),
      SEARCH_EXCLUDES,
      MAX_SEARCH_FILES + 1,
    );
    const searchQuery = caseSensitive ? query : query.toLocaleLowerCase();
    const results: string[] = [];
    let skippedFiles = 0;

    for (const uri of files.slice(0, MAX_SEARCH_FILES)) {
      let content: string;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > MAX_SEARCH_FILE_BYTES) continue;
        content = await this.readContent(uri);
      } catch {
        skippedFiles++;
        continue;
      }
      if (content.includes("\0")) continue;
      const lines = content.split(/\r?\n/);
      const matchingLines: number[] = [];
      for (let index = 0; index < lines.length; index++) {
        const line = caseSensitive
          ? lines[index]
          : lines[index].toLocaleLowerCase();
        if (line.includes(searchQuery)) matchingLines.push(index);
      }

      const relativePath = path
        .relative(root, uri.fsPath)
        .split(path.sep)
        .join("/");
      for (const index of matchingLines) {
        if (results.length >= limit) break;
        const start = Math.max(0, index - contextLines);
        const end = Math.min(lines.length, index + contextLines + 1);
        const excerpt = lines
          .slice(start, end)
          .map((line, offset) => `${start + offset + 1}: ${line}`)
          .join("\n");
        results.push(`${relativePath}:${index + 1}\n${excerpt}`);
      }
      if (results.length >= limit) break;
    }

    if (results.length === 0) {
      if (files.length > MAX_SEARCH_FILES) {
        return `No matches found in the first ${MAX_SEARCH_FILES} candidate files; the scan limit was reached.`;
      }
      return skippedFiles
        ? `No matches found. Skipped ${skippedFiles} unavailable files.`
        : "No matching text found.";
    }
    const limited = results.length >= limit || files.length > MAX_SEARCH_FILES;
    return truncate(
      `${results.join("\n\n")}${limited ? "\n\n[Search results limited]" : ""}${skippedFiles ? `\n[Skipped ${skippedFiles} unavailable files]` : ""}`,
    );
  }

  private async getDiagnostics(
    root: string,
    relativePath: string,
  ): Promise<string> {
    let entries: { uri: vscode.Uri; diagnostic: vscode.Diagnostic[][number] }[];
    if (relativePath) {
      const uri = workspaceFile(root, relativePath);
      entries = vscode.languages
        .getDiagnostics(uri)
        .map((diagnostic) => ({ uri, diagnostic }));
    } else {
      entries = vscode.languages
        .getDiagnostics()
        .filter(([uri]) => {
          const relative = path.relative(root, uri.fsPath);
          return (
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
          );
        })
        .flatMap(([uri, diagnostics]) =>
          diagnostics.map((diagnostic) => ({ uri, diagnostic })),
        );
    }
    const formatted = entries
      .slice(0, MAX_SEARCH_RESULTS)
      .map(({ uri, diagnostic }) => {
        const relative = path
          .relative(root, uri.fsPath)
          .split(path.sep)
          .join("/");
        const severity =
          ["Error", "Warning", "Information", "Hint"][diagnostic.severity] ??
          "Diagnostic";
        return `${relative}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} [${severity}] ${diagnostic.message}`;
      });
    if (formatted.length === 0) return "No diagnostics found.";
    return truncate(
      `${formatted.join("\n")}${entries.length > MAX_SEARCH_RESULTS ? "\n[More diagnostics omitted]" : ""}`,
    );
  }

  private async findReferences(
    root: string,
    relativePath: string,
    line: number,
    character: number,
  ): Promise<string> {
    const uri = workspaceFile(root, relativePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(line - 1, character - 1);
    const references =
      (await vscode.commands.executeCommand<
        (vscode.Location | vscode.LocationLink)[]
      >("vscode.executeReferenceProvider", document.uri, position)) ?? [];
    const formatted = references
      .flatMap((reference) => {
        const targetUri =
          "targetUri" in reference ? reference.targetUri : reference.uri;
        const targetRange =
          "targetRange" in reference ? reference.targetRange : reference.range;
        const relative = path.relative(root, targetUri.fsPath);
        if (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          return [];
        }
        return [
          `${relative.split(path.sep).join("/")}:${targetRange.start.line + 1}:${targetRange.start.character + 1}`,
        ];
      })
      .slice(0, MAX_SEARCH_RESULTS);
    if (formatted.length === 0) return "No symbol references found.";
    return truncate(
      `${formatted.join("\n")}${references.length > MAX_SEARCH_RESULTS ? "\n[More references omitted]" : ""}`,
    );
  }

  private async deleteFile(relativePath: string): Promise<string> {
    const uri = workspaceFile(this.workspaceRoot(), relativePath);
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.File) {
      throw new Error("Only individual files can be moved to the trash.");
    }
    const openDocument = this.openDocument(uri);
    if (openDocument?.isDirty) {
      throw new Error("Save or discard the open file before deleting it.");
    }

    const choice = await vscode.window.showWarningMessage(
      `Move "${relativePath}" to the OS trash?`,
      { modal: true },
      "Move to Trash",
    );
    if (choice !== "Move to Trash") return "Deletion cancelled by the user.";

    const currentStat = await vscode.workspace.fs.stat(uri);
    if (currentStat.mtime !== stat.mtime || currentStat.size !== stat.size) {
      return `Deletion cancelled: ${relativePath} changed while awaiting confirmation.`;
    }
    if (this.openDocument(uri)?.isDirty) {
      return `Deletion cancelled: ${relativePath} has unsaved changes.`;
    }
    await vscode.workspace.fs.delete(uri, { useTrash: true });
    return `Moved ${relativePath} to the OS trash.`;
  }

  /**
   * Reads the content of a file within the workspace, truncating it if necessary.
   * @param root The root directory of the workspace.
   * @param relativePath The relative path to the file within the workspace.
   * @returns The content of the file as a string, or an empty string if the file does not exist.
   */
  private async readFile(root: string, relativePath: string): Promise<string> {
    const uri = workspaceFile(root, relativePath);
    const document = this.openDocument(uri);
    if (document) return truncate(document.getText());

    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return truncate(Buffer.from(content).toString("utf8"));
    } catch (error) {
      if (
        error instanceof vscode.FileSystemError &&
        error.code === "FileNotFound"
      ) {
        return `File not found: ${relativePath}.`;
      }
      throw error;
    }
  }

  /**
   * Proposes a write operation for a specific file within the workspace.
   * @param relativePath The relative path to the file within the workspace.
   * @param content The new content to propose for the file.
   * @returns A write proposal containing the path and the diff between the current and proposed content.
   */
  async proposeWrite(
    relativePath: string,
    content: string,
  ): Promise<WriteProposal> {
    const root = this.workspaceRoot();
    const uri = workspaceFile(root, relativePath);
    const current = await this.readContent(uri);
    return {
      path: relativePath,
      diff: createDiff(relativePath, current, content),
    };
  }

  /**
   * Proposes a replacement of a specific section of a file's content, ensuring that exactly one occurrence of the old text exists.
   * @param relativePath The relative path to the file within the workspace.
   * @param oldText The text to be replaced.
   * @param newText The new text to replace the old text with.
   * @returns An object containing the write proposal, the content before the replacement, and the content after the replacement.
   */

  async proposeReplacement(
    relativePath: string,
    oldText: string,
    newText: string,
  ): Promise<{ proposal: WriteProposal; before: string; after: string }> {
    const before = await this.currentContent(relativePath);
    const occurrences = before.split(oldText).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Expected exactly one matching section in ${relativePath}, found ${occurrences}. Read the file and use a more specific oldText.`,
      );
    }
    const after = before.replace(oldText, newText);
    return {
      proposal: {
        path: relativePath,
        diff: createDiff(relativePath, before, after),
      },
      before,
      after,
    };
  }

  /**
   * Retrieves the project context, including the workspace root and a project tree up to depth 3.
   * @returns A string representing the project context, including the workspace root and a project tree up to depth 3.
   */
  async projectContext(): Promise<string> {
    const root = this.workspaceRoot();
    return `Workspace root: ${root}\nProject tree (depth 3):\n${await this.listProject(root)}`;
  }

  /**
   * Applies a write operation to the specified file if its current content matches the expected content.
   * @param relativePath The relative path to the file within the workspace.
   * @param expectedContent The content expected to be currently in the file.
   * @param content The new content to write to the file.
   * @returns A message indicating the result of the write operation.
   */
  async applyWrite(
    relativePath: string,
    expectedContent: string,
    content: string,
  ): Promise<string> {
    const root = this.workspaceRoot();
    const uri = workspaceFile(root, relativePath);
    const document = this.openDocument(uri);
    const current = document?.getText() ?? (await readTextIfExists(uri));
    if (current !== expectedContent) {
      return `Write cancelled: ${relativePath} changed after the proposal was created.`;
    }

    if (document) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        uri,
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(current.length),
        ),
        content,
      );
      if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error(`VS Code rejected the edit to ${relativePath}.`);
      }
      if (!(await document.save())) {
        throw new Error(`Could not save ${relativePath}.`);
      }
    } else {
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(uri.fsPath)),
      );
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    }

    const persisted = await readTextIfExists(uri);
    if (document?.getText() !== content && document) {
      throw new Error(`Editor verification failed for ${relativePath}.`);
    }
    if (persisted !== content) {
      throw new Error(`Write verification failed for ${relativePath}.`);
    }
    return `Wrote ${relativePath}.`;
  }

  /**
   * Retrieves the current content of the specified file within the workspace.
   * @param relativePath The relative path to the file within the workspace.
   * @returns The content of the file as a string, or an empty string if the file does not exist.
   */
  async currentContent(relativePath: string): Promise<string> {
    return this.readContent(workspaceFile(this.workspaceRoot(), relativePath));
  }

  private async readContent(uri: vscode.Uri): Promise<string> {
    return this.openDocument(uri)?.getText() ?? (await readTextIfExists(uri));
  }

  private openDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri.toString(),
    );
  }

  /**
   * Returns the root directory of the currently opened workspace.
   * @returns The absolute path to the workspace root directory.
   */
  private workspaceRoot(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root)
      throw new Error("Open a workspace folder before using project tools.");
    return root;
  }

  /**
   * Runs a shell command in the context of the workspace root directory.
   * @param command The command to run in the workspace root.
   * @returns The combined stdout and stderr output of the command, truncated if necessary.
   */
  async runCommand(
    command: string,
    onOutput?: (chunk: string) => void,
  ): Promise<string> {
    return new Promise((resolve) => {
      let streamedLength = 0;
      let outputTruncated = false;
      const forwardOutput = (chunk: Buffer | string) => {
        if (!onOutput || outputTruncated) return;

        const text = chunk.toString();
        const remaining = MAX_OUTPUT_LENGTH - streamedLength;
        const visible = text.slice(0, remaining);
        if (visible) {
          streamedLength += visible.length;
          try {
            onOutput(visible);
          } catch {
            // A closed webview should not interrupt command execution.
          }
        }
        if (visible.length < text.length) {
          outputTruncated = true;
          onOutput("\n[Output truncated]");
        }
      };

      const child = exec(
        command,
        {
          cwd: this.workspaceRoot(),
          timeout: TOOL_TIMEOUT,
          maxBuffer: MAX_OUTPUT_LENGTH,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            const details = error as Error & {
              stdout?: string;
              stderr?: string;
            };
            resolve(
              truncate(
                `Command failed: ${details.message}\n${details.stdout ?? stdout}${details.stderr ?? stderr}`,
              ),
            );
            return;
          }

          resolve(
            truncate(`${stdout}${stderr}`) ||
              "Command completed with no output.",
          );
        },
      );
      child.stdout?.on("data", forwardOutput);
      child.stderr?.on("data", forwardOutput);
    });
  }
}
