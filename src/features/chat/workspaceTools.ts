import { exec } from "child_process";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import { ToolCall, WriteProposal } from "./types";

const execute = promisify(exec);
const MAX_OUTPUT_LENGTH = 12_000;

export class WorkspaceTools {
  async run(call: ToolCall): Promise<string> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      throw new Error("Open a workspace folder before using project tools.");
    }

    switch (call.tool) {
      case "list_project":
        return this.listProject(root);
      case "read_file":
        return this.readFile(root, requiredString(call.arguments.path, "path"));
      case "write_file":
        throw new Error("Write requests must be reviewed before execution.");
      case "replace_in_file":
        throw new Error("Edit requests must be reviewed before execution.");
      case "run_command":
        return this.runCommand(
          root,
          requiredString(call.arguments.command, "command"),
        );
    }
  }

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
        if (["node_modules", ".git", "out"].includes(name)) continue;

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

  private async readFile(root: string, relativePath: string): Promise<string> {
    const uri = workspaceFile(root, relativePath);
    const content = Buffer.from(
      await vscode.workspace.fs.readFile(uri),
    ).toString("utf8");
    return truncate(content);
  }

  async proposeWrite(
    relativePath: string,
    content: string,
  ): Promise<WriteProposal> {
    const root = this.workspaceRoot();
    const uri = workspaceFile(root, relativePath);
    const current = await readTextIfExists(uri);
    return {
      path: relativePath,
      diff: createDiff(relativePath, current, content),
    };
  }

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

  async projectContext(): Promise<string> {
    const root = this.workspaceRoot();
    return `Workspace root: ${root}\nProject tree (depth 3):\n${await this.listProject(root)}`;
  }

  async applyWrite(
    relativePath: string,
    expectedContent: string,
    content: string,
  ): Promise<string> {
    const root = this.workspaceRoot();
    const uri = workspaceFile(root, relativePath);
    const current = await readTextIfExists(uri);
    if (current !== expectedContent) {
      return `Write cancelled: ${relativePath} changed after the proposal was created.`;
    }
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(path.dirname(uri.fsPath)),
    );
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    return `Wrote ${relativePath}.`;
  }

  async currentContent(relativePath: string): Promise<string> {
    return readTextIfExists(workspaceFile(this.workspaceRoot(), relativePath));
  }

  private workspaceRoot(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root)
      throw new Error("Open a workspace folder before using project tools.");
    return root;
  }

  private async runCommand(root: string, command: string): Promise<string> {
    const approved = await vscode.window.showWarningMessage(
      `Good Buddy wants to run: ${command}`,
      { modal: true, detail: `Working directory: ${root}` },
      "Run command",
    );
    if (approved !== "Run command") return "Command denied by the user.";
    try {
      const { stdout, stderr } = await execute(command, {
        cwd: root,
        timeout: 60_000,
        maxBuffer: MAX_OUTPUT_LENGTH,
        windowsHide: true,
      });
      return (
        truncate(`${stdout}${stderr}`) || "Command completed with no output."
      );
    } catch (error) {
      const details = error as {
        stdout?: string;
        stderr?: string;
        message: string;
      };
      return truncate(
        `Command failed: ${details.message}\n${details.stdout ?? ""}${details.stderr ?? ""}`,
      );
    }
  }
}

function workspaceFile(root: string, relativePath: string): vscode.Uri {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Tool paths must stay inside the opened workspace.");
  }
  return vscode.Uri.file(resolved);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`Tool argument '${name}' must be a non-empty string.`);
  return value;
}

function truncate(value: string): string {
  return value.length > MAX_OUTPUT_LENGTH
    ? `${value.slice(0, MAX_OUTPUT_LENGTH)}\n…[truncated]`
    : value;
}

async function readTextIfExists(uri: vscode.Uri): Promise<string> {
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

function createDiff(
  relativePath: string,
  before: string,
  after: string,
): string {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++;
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
