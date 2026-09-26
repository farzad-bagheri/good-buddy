import { exec } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import type { ToolCall, ToolDefinition } from "../types";
import { MAX_OUTPUT_LENGTH, TOOL_TIMEOUT } from "../constants";
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
        description: "List the workspace project tree.",
        execute: async () => this.listProject(this.workspaceRoot()),
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
        id: "write_file",
        description: "Propose complete contents for a workspace file.",
        execute: executeWrite,
      },
      {
        id: "replace_in_file",
        description: "Propose replacing one exact section in a workspace file.",
        execute: executeWrite,
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
   * Retrieves the project context, including the workspace root and a project tree up to depth 3.
   * @param root The root directory of the workspace.
   * @returns A string representing the project context, including the workspace root and a project tree up to depth 3.
   */
  private async listProject(root: string): Promise<string> {
    const entries: string[] = [];
    const visit = async (
      folder: vscode.Uri,
      relative: string,
      depth: number,
    ) => {
      if (depth > 3 || entries.length >= 250) return;

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

    await visit(vscode.Uri.file(root), "", 0);
    return entries.join("\n") || "The workspace is empty.";
  }

  /**
   * Reads the content of a file within the workspace, truncating it if necessary.
   * @param root The root directory of the workspace.
   * @param relativePath The relative path to the file within the workspace.
   * @returns The content of the file as a string, or an empty string if the file does not exist.
   */
  private async readFile(root: string, relativePath: string): Promise<string> {
    const uri = workspaceFile(root, relativePath);
    const content = await this.readContent(uri);
    return truncate(content);
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
