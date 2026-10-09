import { beforeEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import { WorkspaceTools } from "./WorkspaceTools";

const vscodeState = vi.hoisted(() => ({
  root: "",
  files: new Map<string, string>(),
  documents: [] as Array<{
    uri: { fsPath: string; toString(): string };
    value: string;
    getText(): string;
    positionAt(offset: number): { character: number };
    save(): Promise<boolean>;
  }>,
  editCalls: 0,
  fileWriteCalls: 0,
  fileDeleteCalls: 0,
  deleteUsesTrash: false,
  warningChoice: undefined as string | undefined,
  warningCalls: 0,
  diagnostics: [] as Array<{
    severity: number;
    message: string;
    range: { start: { line: number; character: number } };
  }>,
  references: [] as Array<{
    uri: { fsPath: string };
    range: { start: { line: number; character: number } };
  }>,
}));

vi.mock("vscode", () => {
  class FileSystemError extends Error {
    code = "FileNotFound";
  }

  class WorkspaceEdit {
    change?: {
      uri: { fsPath: string; toString(): string };
      range: { start: { character: number }; end: { character: number } };
      text: string;
    };

    replace(
      uri: { fsPath: string; toString(): string },
      range: { start: { character: number }; end: { character: number } },
      text: string,
    ): void {
      this.change = { uri, range, text };
    }
  }

  class Range {
    constructor(
      readonly start: { character: number },
      readonly end: { character: number },
    ) {}
  }

  class RelativePattern {
    constructor(
      readonly base: { fsPath: string },
      readonly pattern: string,
    ) {}
  }

  class Position {
    constructor(
      readonly line: number,
      readonly character: number,
    ) {}
  }

  const uri = (fsPath: string) => ({ fsPath, toString: () => fsPath });

  return {
    Uri: {
      file: uri,
      joinPath: (base: { fsPath: string }, ...segments: string[]) =>
        uri(path.join(base.fsPath, ...segments)),
    },
    RelativePattern,
    Range,
    Position,
    WorkspaceEdit,
    FileSystemError,
    workspace: {
      get workspaceFolders() {
        return [{ uri: { fsPath: vscodeState.root } }];
      },
      get textDocuments() {
        return vscodeState.documents;
      },
      fs: {
        readDirectory: async () => [],
        stat: async (file: { fsPath: string }) => {
          const content = vscodeState.files.get(file.fsPath);
          if (content === undefined) throw new Error("File not found");
          return {
            type: 1,
            size: Buffer.byteLength(content),
            mtime: 1,
          };
        },
        readFile: async (file: { fsPath: string }) => {
          const content = vscodeState.files.get(file.fsPath);
          if (content === undefined) {
            throw new FileSystemError("File not found");
          }
          return Buffer.from(content, "utf8");
        },
        createDirectory: async () => undefined,
        writeFile: async (file: { fsPath: string }, content: Uint8Array) => {
          vscodeState.fileWriteCalls++;
          vscodeState.files.set(
            file.fsPath,
            Buffer.from(content).toString("utf8"),
          );
        },
        delete: async (
          file: { fsPath: string },
          options: { useTrash?: boolean },
        ) => {
          vscodeState.fileDeleteCalls++;
          vscodeState.deleteUsesTrash = options.useTrash === true;
          vscodeState.files.delete(file.fsPath);
        },
      },
      findFiles: async (
        include: RelativePattern,
        _exclude: string,
        maxResults: number,
      ) => {
        const escaped = include.pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replaceAll("**/", "(?:.*/)?")
          .replaceAll("**", ".*")
          .replaceAll("*", "[^/]*");
        const matcher = new RegExp(`^${escaped}$`);
        return [...vscodeState.files.keys()]
          .filter((filePath) => {
            const relativePath = path
              .relative(include.base.fsPath, filePath)
              .split(path.sep)
              .join("/");
            return (
              !relativePath.startsWith("../") && matcher.test(relativePath)
            );
          })
          .slice(0, maxResults)
          .map(uri);
      },
      openTextDocument: async (file: { fsPath: string }) => ({
        uri: file,
        getText: () => vscodeState.files.get(file.fsPath) ?? "",
      }),
      asRelativePath: (file: { fsPath: string }) =>
        path.relative(vscodeState.root, file.fsPath),
      applyEdit: async (edit: WorkspaceEdit) => {
        vscodeState.editCalls++;
        const change = edit.change;
        const document = vscodeState.documents.find(
          (candidate) => candidate.uri.toString() === change?.uri.toString(),
        );
        if (!change || !document) return false;
        document.value =
          document.value.slice(0, change.range.start.character) +
          change.text +
          document.value.slice(change.range.end.character);
        return true;
      },
    },
    languages: {
      getDiagnostics: () => vscodeState.diagnostics,
    },
    commands: {
      executeCommand: async () => vscodeState.references,
    },
    window: {
      showWarningMessage: async () => {
        vscodeState.warningCalls++;
        return vscodeState.warningChoice;
      },
    },
    FileType: { File: 1, Directory: 2 },
  };
});

describe("WorkspaceTools writes", () => {
  beforeEach(() => {
    vscodeState.root = "D:\\workspace";
    vscodeState.files.clear();
    vscodeState.documents.length = 0;
    vscodeState.editCalls = 0;
    vscodeState.fileWriteCalls = 0;
    vscodeState.fileDeleteCalls = 0;
    vscodeState.deleteUsesTrash = false;
    vscodeState.warningChoice = undefined;
    vscodeState.warningCalls = 0;
    vscodeState.diagnostics = [];
    vscodeState.references = [];
  });

  it("includes the extension host OS and command shell in project context", async () => {
    const context = await new WorkspaceTools().projectContext();
    const platform =
      process.platform === "win32"
        ? "Windows"
        : process.platform === "darwin"
          ? "macOS"
          : process.platform === "linux"
            ? "Linux"
            : process.platform;

    expect(context).toContain(`Execution environment: ${platform}`);
    expect(context).toContain(`(${process.platform}); run_command shell:`);
    if (process.platform === "win32") {
      expect(context).toContain("Use Windows command syntax");
    } else {
      expect(context).toContain("Use POSIX shell syntax");
    }
  });

  it("distinguishes missing files from existing empty files when reading", async () => {
    const readFileTool = new WorkspaceTools()
      .createTools(async () => "", async () => "")
      .find((tool) => tool.id === "read_file");
    if (!readFileTool) throw new Error("read_file tool was not registered");

    vscodeState.files.set("D:\\workspace\\empty.txt", "");
    await expect(
      readFileTool.execute({
        tool: "read_file",
        autoApprove: false,
        arguments: { path: "missing.txt" },
      }),
    ).resolves.toBe("File not found: missing.txt.");
    await expect(
      readFileTool.execute({
        tool: "read_file",
        autoApprove: false,
        arguments: { path: "empty.txt" },
      }),
    ).resolves.toBe("");
  });

  it("updates and saves an open editor document", async () => {
    const filePath = "D:\\workspace\\notes.txt";
    vscodeState.files.set(filePath, "before");
    const document = {
      uri: { fsPath: filePath, toString: () => filePath },
      value: "before",
      getText() {
        return this.value;
      },
      positionAt(offset: number) {
        return { character: offset };
      },
      async save() {
        vscodeState.files.set(filePath, this.value);
        return true;
      },
    };
    vscodeState.documents.push(document);

    await expect(
      new WorkspaceTools().applyWrite("notes.txt", "before", "after"),
    ).resolves.toBe("Wrote notes.txt.");

    expect(document.getText()).toBe("after");
    expect(vscodeState.files.get(filePath)).toBe("after");
    expect(vscodeState.editCalls).toBe(1);
    expect(vscodeState.fileWriteCalls).toBe(0);
  });

  it("writes and verifies a closed file through the workspace filesystem", async () => {
    const filePath = "D:\\workspace\\notes.txt";
    vscodeState.files.set(filePath, "before");

    await expect(
      new WorkspaceTools().applyWrite("notes.txt", "before", "after"),
    ).resolves.toBe("Wrote notes.txt.");

    expect(vscodeState.files.get(filePath)).toBe("after");
    expect(vscodeState.fileWriteCalls).toBe(1);
    expect(vscodeState.editCalls).toBe(0);
  });

  it("searches workspace paths with a glob", async () => {
    vscodeState.files.set("D:\\workspace\\src\\main.ts", "content");
    vscodeState.files.set("D:\\workspace\\README.md", "content");
    const searchFiles = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "search_files");

    await expect(
      searchFiles?.execute({
        tool: "search_files",
        autoApprove: true,
        arguments: { pattern: "**/*.ts" },
      }),
    ).resolves.toBe("src/main.ts");
  });

  it("searches file contents and reports matching line numbers", async () => {
    vscodeState.files.set(
      "D:\\workspace\\src\\main.ts",
      "const first = 1;\nconst target = true;\nconst last = 3;",
    );
    const searchContents = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "search_file_contents");

    await expect(
      searchContents?.execute({
        tool: "search_file_contents",
        autoApprove: true,
        arguments: { query: "target", path: "**/*.ts", contextLines: 0 },
      }),
    ).resolves.toBe("src/main.ts:2\n2: const target = true;");
  });

  it("rejects blank content-search queries", async () => {
    const searchContents = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "search_file_contents");

    await expect(
      searchContents?.execute({
        tool: "search_file_contents",
        autoApprove: true,
        arguments: { query: "   " },
      }),
    ).rejects.toThrow("Search query must not be empty.");
  });

  it("formats VS Code diagnostics with workspace-relative locations", async () => {
    vscodeState.files.set("D:\\workspace\\src\\main.ts", "content");
    vscodeState.diagnostics = [
      {
        severity: 0,
        message: "Unexpected token",
        range: { start: { line: 2, character: 4 } },
      },
    ];
    const getDiagnostics = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "get_diagnostics");

    await expect(
      getDiagnostics?.execute({
        tool: "get_diagnostics",
        autoApprove: true,
        arguments: { path: "src/main.ts" },
      }),
    ).resolves.toBe("src/main.ts:3:5 [Error] Unexpected token");
  });

  it("finds symbol references at a one-based file position", async () => {
    vscodeState.files.set("D:\\workspace\\src\\main.ts", "const target = 1;");
    vscodeState.references = [
      {
        uri: { fsPath: "D:\\workspace\\src\\other.ts" },
        range: { start: { line: 4, character: 6 } },
      },
    ];
    const findReferences = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "find_references");

    await expect(
      findReferences?.execute({
        tool: "find_references",
        autoApprove: true,
        arguments: { path: "src/main.ts", line: 1, character: 7 },
      }),
    ).resolves.toBe("src/other.ts:5:7");
  });

  it("always confirms deletion and moves only the selected file to trash", async () => {
    vscodeState.files.set("D:\\workspace\\notes.txt", "contents");
    vscodeState.warningChoice = "Move to Trash";
    const deleteFile = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "delete_file");

    await expect(
      deleteFile?.execute({
        tool: "delete_file",
        autoApprove: true,
        arguments: { path: "notes.txt" },
      }),
    ).resolves.toBe("Moved notes.txt to the OS trash.");
    expect(vscodeState.warningCalls).toBe(1);
    expect(vscodeState.fileDeleteCalls).toBe(1);
    expect(vscodeState.deleteUsesTrash).toBe(true);
    expect(vscodeState.files.has("D:\\workspace\\notes.txt")).toBe(false);
  });

  it("does not delete a file when the user cancels confirmation", async () => {
    vscodeState.files.set("D:\\workspace\\notes.txt", "contents");
    const deleteFile = new WorkspaceTools()
      .createTools(
        async () => "",
        async () => "",
      )
      .find((tool) => tool.id === "delete_file");

    await expect(
      deleteFile?.execute({
        tool: "delete_file",
        autoApprove: false,
        arguments: { path: "notes.txt" },
      }),
    ).resolves.toBe("Deletion cancelled by the user.");
    expect(vscodeState.fileDeleteCalls).toBe(0);
    expect(vscodeState.files.has("D:\\workspace\\notes.txt")).toBe(true);
  });

  it("returns no review input when the repository has no changes", async () => {
    const tools = new WorkspaceTools(async (_root, args) => {
      if (args[0] === "status") return "## main";
      return "";
    });

    await expect(tools.getGitChanges()).resolves.toBeUndefined();
  });

  it("collects staged, unstaged, and untracked text changes read-only", async () => {
    const calls: string[][] = [];
    const tools = new WorkspaceTools(async (_root, args) => {
      calls.push(args);
      if (args[0] === "status") {
        return "## main\n M tracked.ts\nA  staged.ts\n?? new.ts";
      }
      if (args[0] === "diff" && args.includes("--cached")) {
        return "diff --git a/staged.ts b/staged.ts\n+staged change";
      }
      if (args[0] === "diff") {
        return "diff --git a/tracked.ts b/tracked.ts\n+unstaged change";
      }
      if (args[0] === "ls-files") return "new.ts\0";
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    });
    vscodeState.files.set("D:\\workspace\\new.ts", "const added = true;");

    const result = await tools.getGitChanges();

    expect(result).toContain("unstaged change");
    expect(result).toContain("staged change");
    expect(result).toContain("Untracked file: new.ts");
    expect(result).toContain("1: const added = true;");
    expect(calls).toHaveLength(4);
    expect(
      calls
        .filter((args) => args[0] === "diff")
        .every((args) => args.includes("--unified=1")),
    ).toBe(true);
    expect(
      calls.every((args) =>
        !args.some((arg) => ["add", "reset", "checkout"].includes(arg)),
      ),
    ).toBe(true);
  });

  it("bounds large Git review snapshots and truncates only at line boundaries", async () => {
    const largeDiff = Array.from(
      { length: 6_000 },
      (_, index) => `+line-${index}`,
    ).join("\n");
    const tools = new WorkspaceTools(async (_root, args) => {
      if (args[0] === "status") return "## main\n M large.ts";
      if (args[0] === "diff") return `diff --git a/large.ts b/large.ts\n${largeDiff}`;
      return "";
    });

    const result = await tools.getGitChanges();

    expect(result?.length).toBeLessThanOrEqual(10_000);
    expect(result).toContain(" M large.ts");
    expect(result).toContain("[Section truncated at a line boundary");
    expect(result).toContain("Report only actionable findings");
    expect(result).not.toContain("+line-5000");
  });
});
