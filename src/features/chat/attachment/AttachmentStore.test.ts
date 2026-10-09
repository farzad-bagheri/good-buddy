import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentStore } from "./AttachmentStore";

const vscodeState = vi.hoisted(() => ({
  selected: [] as Array<{ path: string }>,
  files: new Map<string, Uint8Array>(),
  showWarningMessage: vi.fn(),
  activeDocument: undefined as
    | {
        uri: { path: string; scheme: string };
        fileName: string;
        getText(): string;
      }
    | undefined,
  editorSelection: undefined as
    | {
        isEmpty: boolean;
        start: { line: number };
        end: { line: number; character: number };
      }
    | undefined,
}));

vi.mock("vscode", () => ({
  window: {
    showOpenDialog: async () => vscodeState.selected,
    showWarningMessage: vscodeState.showWarningMessage,
    get activeTextEditor() {
      return vscodeState.activeDocument
        ? {
            document: vscodeState.activeDocument,
            selection: vscodeState.editorSelection,
          }
        : undefined;
    },
  },
  workspace: {
    asRelativePath: (uri: { path: string }) =>
      uri.path.replace(/^\/workspace\//, ""),
    fs: {
      readFile: async (uri: { path: string }) =>
        vscodeState.files.get(uri.path),
    },
  },
}));

describe("AttachmentStore", () => {
  beforeEach(() => {
    vscodeState.selected = [];
    vscodeState.files.clear();
    vscodeState.activeDocument = undefined;
    vscodeState.editorSelection = undefined;
    vscodeState.showWarningMessage.mockClear();
  });

  it("uses a basename for name and a workspace-relative path", () => {
    const store = new AttachmentStore();
    vscodeState.activeDocument = {
      uri: { path: "/workspace/src/test/foo.tsx", scheme: "file" },
      fileName: "D:\\workspace\\src\\test\\foo.tsx",
      getText: () => "current buffer",
    };

    expect(store.activeDocumentAttachment()).toEqual({
      name: "foo.tsx",
      path: "src/test/foo.tsx",
      content: "current buffer",
    });
  });

  it.each(["output", "extension-output"])(
    "ignores active documents with the %s URI scheme",
    (scheme) => {
      const store = new AttachmentStore();
      vscodeState.activeDocument = {
        uri: { path: "/Good Buddy", scheme },
        fileName: "Good Buddy",
        getText: () => "output channel content",
      };

      expect(store.activeDocumentAttachment()).toBeUndefined();
    },
  );

  it("accepts selected PNG files as image attachments", async () => {
    const store = new AttachmentStore();
    const image = Buffer.from("png image bytes");
    vscodeState.selected = [{ path: "/workspace/screenshot.png" }];
    vscodeState.files.set("/workspace/screenshot.png", image);

    await store.pick();

    expect(store.images).toHaveLength(1);
    expect(store.images[0]).toMatchObject({
      name: "screenshot.png",
      mimeType: "image/png",
      data: image.toString("base64"),
    });
    expect(store.all).toHaveLength(0);
  });

  it("validates clipboard image data and supports removing image attachments", () => {
    const store = new AttachmentStore();
    store.addImageBase64("clip.png", "image/png", "aGVsbG8=");
    store.addImageBase64("bad.png", "image/png", "not base64!");
    expect(store.images).toHaveLength(1);

    const id = store.images[0].id;
    store.removeImage(id);
    expect(store.images).toHaveLength(0);
  });

  it("includes a default attachment with manually selected files", async () => {
    const store = new AttachmentStore();
    vscodeState.selected = [{ path: "/workspace/manual.txt" }];
    vscodeState.files.set(
      "/workspace/manual.txt",
      Buffer.from("manual content", "utf8"),
    );
    await store.pick();
    const activeDocument = {
      name: "current.ts",
      path: "src/current.ts",
      content: "current buffer",
    };

    expect(store.names(activeDocument)).toEqual(["current.ts", "manual.txt"]);
    expect(store.formatForPrompt(activeDocument)).toContain(
      "Attached file: src/current.ts\n```\ncurrent buffer\n```",
    );
    expect(store.formatForPrompt(activeDocument)).toContain(
      "Attached file: manual.txt\n```\nmanual content\n```",
    );
    expect(store.all).toHaveLength(1);
  });

  it("does not duplicate a default file already manually attached", async () => {
    const store = new AttachmentStore();
    vscodeState.selected = [{ path: "/workspace/current.ts" }];
    vscodeState.files.set(
      "/workspace/current.ts",
      Buffer.from("same content", "utf8"),
    );
    await store.pick();
    const activeDocument = {
      name: "current.ts",
      path: "current.ts",
      content: "same content",
    };

    expect(store.names(activeDocument)).toEqual(["current.ts"]);
    expect(
      store.formatForPrompt(activeDocument).match(/Attached file:/g),
    ).toHaveLength(1);
  });

  it("adds selected code as a removable text attachment", () => {
    const store = new AttachmentStore();
    store.addSelection(
      "current.ts (selection, lines 3-5)",
      "src/current.ts (selection, lines 3-5)",
      "src/current.ts",
      "const answer = 42;",
    );

    expect(store.all).toEqual([
      {
        name: "current.ts (selection, lines 3-5)",
        path: "src/current.ts (selection, lines 3-5)",
        content: "const answer = 42;",
        sourcePath: "src/current.ts",
        kind: "selection",
      },
    ]);
    expect(store.formatForPrompt()).toContain(
      "Attached selection: src/current.ts (selection, lines 3-5)\n```\nconst answer = 42;\n```",
    );
  });

  it("does not add empty, oversized, or duplicate selection attachments", () => {
    const store = new AttachmentStore();
    store.addSelection(
      "empty",
      "src/current.ts (selection, line 1)",
      "src/current.ts",
      "",
    );
    store.addSelection(
      "oversized",
      "src/current.ts (selection, lines 1-2)",
      "src/current.ts",
      "x".repeat(10 * 1024 + 1),
    );
    store.addSelection(
      "selection",
      "src/current.ts (selection, lines 1-2)",
      "src/current.ts",
      "selected code",
    );
    store.addSelection(
      "duplicate",
      "src/current.ts (selection, lines 1-2)",
      "src/current.ts",
      "selected code again",
    );

    expect(store.all).toHaveLength(1);
    expect(vscodeState.showWarningMessage).toHaveBeenCalledTimes(3);
  });

  it("uses a selection instead of implicitly attaching the whole active file", () => {
    const store = new AttachmentStore();
    vscodeState.activeDocument = {
      uri: { path: "/workspace/src/current.ts", scheme: "file" },
      fileName: "D:\\workspace\\src\\current.ts",
      getText: () => "whole file",
    };
    store.addSelection(
      "current.ts (selection, line 1)",
      "src/current.ts (selection, line 1)",
      "src/current.ts",
      "selected code",
    );

    const activeDocument = store.activeDocumentAttachment();
    expect(activeDocument).toBeUndefined();
    expect(store.names(activeDocument)).toEqual([
      "current.ts (selection, line 1)",
    ]);
    expect(store.formatForPrompt(activeDocument)).not.toContain("whole file");
    expect(store.formatForPrompt(activeDocument)).toContain("selected code");
  });

  it("can exclude the active file from the next message", () => {
    const store = new AttachmentStore();
    vscodeState.activeDocument = {
      uri: { path: "/workspace/src/current.ts", scheme: "file" },
      fileName: "D:\\workspace\\src\\current.ts",
      getText: () => "whole file",
    };

    store.excludeActiveDocument("src/current.ts");

    expect(store.activeDocumentAttachment()).toBeUndefined();
    store.clear();
    expect(store.activeDocumentAttachment()).toMatchObject({
      path: "src/current.ts",
    });
  });
});
