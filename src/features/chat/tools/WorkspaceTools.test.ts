import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("vscode", () => {
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

  const uri = (fsPath: string) => ({ fsPath, toString: () => fsPath });

  return {
    Uri: { file: uri },
    Range,
    WorkspaceEdit,
    FileSystemError: class extends Error {
      code = "FileNotFound";
    },
    workspace: {
      get workspaceFolders() {
        return [{ uri: { fsPath: vscodeState.root } }];
      },
      get textDocuments() {
        return vscodeState.documents;
      },
      fs: {
        readFile: async (file: { fsPath: string }) => {
          const content = vscodeState.files.get(file.fsPath);
          if (content === undefined) {
            throw Object.assign(new Error("File not found"), {
              code: "FileNotFound",
            });
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
      },
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
  };
});

describe("WorkspaceTools writes", () => {
  beforeEach(() => {
    vscodeState.root = "D:\\workspace";
    vscodeState.files.clear();
    vscodeState.documents.length = 0;
    vscodeState.editCalls = 0;
    vscodeState.fileWriteCalls = 0;
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
});
