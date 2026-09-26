import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentStore } from "./AttachmentStore";

const vscodeState = vi.hoisted(() => ({
  selected: [] as Array<{ path: string }>,
  files: new Map<string, Uint8Array>(),
  activeDocument: undefined as
    | { uri: { path: string }; fileName: string; getText(): string }
    | undefined,
}));

vi.mock("vscode", () => ({
  window: {
    showOpenDialog: async () => vscodeState.selected,
    showWarningMessage: vi.fn(),
    get activeTextEditor() {
      return vscodeState.activeDocument
        ? { document: vscodeState.activeDocument }
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
  });

  it("uses a basename for name and a workspace-relative path", () => {
    const store = new AttachmentStore();
    vscodeState.activeDocument = {
      uri: { path: "/workspace/src/test/foo.tsx" },
      fileName: "D:\\workspace\\src\\test\\foo.tsx",
      getText: () => "current buffer",
    };

    expect(store.activeDocumentAttachment()).toEqual({
      name: "foo.tsx",
      path: "src/test/foo.tsx",
      content: "current buffer",
    });
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
});
