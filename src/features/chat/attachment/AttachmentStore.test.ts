import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentStore } from "./AttachmentStore";

const vscodeState = vi.hoisted(() => ({
  selected: [] as Array<{ path: string }>,
  files: new Map<string, Uint8Array>(),
}));

vi.mock("vscode", () => ({
  window: {
    showOpenDialog: async () => vscodeState.selected,
    showWarningMessage: vi.fn(),
  },
  workspace: {
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
      name: "src/current.ts",
      content: "current buffer",
    };

    expect(store.names(activeDocument)).toEqual([
      "src/current.ts",
      "manual.txt",
    ]);
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
      content: "same content",
    };

    expect(store.names(activeDocument)).toEqual(["current.ts"]);
    expect(
      store.formatForPrompt(activeDocument).match(/Attached file:/g),
    ).toHaveLength(1);
  });
});
