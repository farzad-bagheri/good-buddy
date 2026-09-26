import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHistoryStore, StoredChat } from "./ChatHistoryStore";

const storageState = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
}));

vi.mock("vscode", () => {
  const uri = (path: string) => ({ path });
  return {
    Uri: {
      file: uri,
      joinPath: (base: { path: string }, ...parts: string[]) =>
        uri([base.path, ...parts].join("/")),
    },
    workspace: {
      fs: {
        createDirectory: async () => undefined,
        readDirectory: async (directory: { path: string }) =>
          [...storageState.files.keys()]
            .filter((path) => path.startsWith(`${directory.path}/`))
            .map((path) => [path.slice(directory.path.length + 1), 1]),
        readFile: async (file: { path: string }) => {
          const contents = storageState.files.get(file.path);
          if (!contents) throw new Error("File not found");
          return contents;
        },
        writeFile: async (file: { path: string }, contents: Uint8Array) => {
          storageState.files.set(file.path, contents);
        },
        delete: async (file: { path: string }) => {
          storageState.files.delete(file.path);
        },
      },
    },
  };
});

describe("ChatHistoryStore", () => {
  beforeEach(() => storageState.files.clear());

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
