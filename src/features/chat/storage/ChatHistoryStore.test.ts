import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHistoryStore, StoredChat } from "./ChatHistoryStore";

const storageState = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  deleteError: undefined as Error | undefined,
}));

vi.mock("vscode", () => {
  class FileSystemError extends Error {
    code = "FileNotFound";
  }

  const uri = (path: string) => ({ path });
  return {
    Uri: {
      file: uri,
      joinPath: (base: { path: string }, ...parts: string[]) =>
        uri([base.path, ...parts].join("/")),
    },
    FileSystemError,
    workspace: {
      fs: {
        createDirectory: async () => undefined,
        readDirectory: async (directory: { path: string }) =>
          [...storageState.files.keys()]
            .filter((path) => path.startsWith(`${directory.path}/`))
            .map((path) => [path.slice(directory.path.length + 1), 1]),
        readFile: async (file: { path: string }) => {
          const contents = storageState.files.get(file.path);
          if (!contents) throw new FileSystemError("File not found");
          return contents;
        },
        writeFile: async (file: { path: string }, contents: Uint8Array) => {
          storageState.files.set(file.path, contents);
        },
        delete: async (file: { path: string }) => {
          if (storageState.deleteError) throw storageState.deleteError;
          storageState.files.delete(file.path);
        },
      },
    },
  };
});

describe("ChatHistoryStore", () => {
  beforeEach(() => {
    storageState.files.clear();
    storageState.deleteError = undefined;
  });

  it("persists full message content and lists chats newest first", async () => {
    const store = new ChatHistoryStore({ path: "/extension" } as never);
    const earlier = createChat(
      "7c89a311-9d47-4d44-90a4-dde41d47f5b0",
      "2026-09-25T10:00:00.000Z",
    );
    const later = createChat(
      "8c89a311-9d47-4d44-90a4-dde41d47f5b0",
      "2026-09-26T10:00:00.000Z",
    );
    later.messages[0].content +=
      "\n\nAttached file: src/app.ts\n```\nfile contents\n```";

    await store.save(earlier);
    await store.save(later);

    const chats = await store.list();
    expect(chats.map(({ id }) => id)).toEqual([later.id, earlier.id]);
    expect(await store.get(later.id)).toEqual(later);
    expect(chats[0]).not.toHaveProperty("messages");
  });

  it("deletes a saved chat", async () => {
    const store = new ChatHistoryStore({ path: "/extension" } as never);
    const chat = createChat(
      "7c89a311-9d47-4d44-90a4-dde41d47f5b0",
      "2026-09-26T10:00:00.000Z",
    );
    await store.save(chat);

    await store.delete(chat.id);

    expect(await store.get(chat.id)).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });

  it("stores image bytes outside chat JSON and restores them on load", async () => {
    const store = new ChatHistoryStore({ path: "/extension" } as never);
    const chat = createChat(
      "7c89a311-9d47-4d44-90a4-dde41d47f5b0",
      "2026-09-26T10:00:00.000Z",
    );
    chat.messages[0].images = [
      { name: "screenshot.png", mimeType: "image/png", data: "aGVsbG8=" },
    ];

    await store.save(chat);

    const chatJson = Buffer.from(
      storageState.files.get("/extension/chats/7c89a311-9d47-4d44-90a4-dde41d47f5b0.json")!,
    ).toString("utf8");
    const imageJson = Buffer.from(
      storageState.files.get("/extension/chats/7c89a311-9d47-4d44-90a4-dde41d47f5b0.images.json")!,
    ).toString("utf8");
    expect(chatJson).not.toContain("aGVsbG8=");
    expect(JSON.parse(imageJson)).toEqual([
      { id: "m0i0", data: "aGVsbG8=" },
    ]);
    await expect(store.get(chat.id)).resolves.toEqual(chat);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("surfaces filesystem errors when deleting a chat", async () => {
    const store = new ChatHistoryStore({ path: "/extension" } as never);
    const chat = createChat(
      "7c89a311-9d47-4d44-90a4-dde41d47f5b0",
      "2026-09-26T10:00:00.000Z",
    );
    await store.save(chat);
    storageState.deleteError = new Error("Permission denied");

    await expect(store.delete(chat.id)).rejects.toThrow("Permission denied");
  });
});

function createChat(id: string, updatedAt: string): StoredChat {
  return {
    id,
    title: "Review app",
    createdAt: "2026-09-25T09:00:00.000Z",
    updatedAt,
    model: "qwen3:8b",
    messages: [
      {
        role: "user",
        content: "Review this file",
        displayContent: "Review this file\n\nAttached: app.ts",
      },
      { role: "assistant", content: "Looks good." },
    ],
  };
}
