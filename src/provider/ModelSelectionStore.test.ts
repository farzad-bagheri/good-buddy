import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  config: {
    provider: "openai-compatible" as "ollama" | "openai-compatible",
    endpoint: "http://localhost:11434",
    openAICompatibleEndpoint: "http://localhost:1234/v1",
  },
  legacyModels: {} as Record<string, string>,
}));

vi.mock("@/config", () => ({
  getGoodBuddyConfig: () => mocked.config,
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: string) =>
        mocked.legacyModels[key] ?? fallback,
    }),
  },
}));

import { ModelSelectionStore } from "./ModelSelectionStore";

class MemoryState {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

describe("ModelSelectionStore", () => {
  beforeEach(() => {
    mocked.config.provider = "openai-compatible";
    mocked.config.endpoint = "http://localhost:11434";
    mocked.config.openAICompatibleEndpoint = "http://localhost:1234/v1";
    mocked.legacyModels = {};
  });

  it("keeps model selections independent by provider and endpoint", async () => {
    const store = new ModelSelectionStore(new MemoryState());
    mocked.config.provider = "openai-compatible";
    mocked.config.openAICompatibleEndpoint = "http://localhost:1234/v1";
    await store.selectChatModel("lm-studio-model");
    await store.selectCompletionModel("fast-model");

    mocked.config.openAICompatibleEndpoint = "http://localhost:5678/v1";
    expect(store.getChatModel()).toBe("");
    expect(store.getCompletionModel()).toBe("");

    mocked.config.provider = "ollama";
    expect(store.getChatModel()).toBe("");
    expect(store.getCompletionModel()).toBe("");

    mocked.config.provider = "openai-compatible";
    mocked.config.openAICompatibleEndpoint = "http://localhost:1234/v1";
    expect(store.getChatModel()).toBe("lm-studio-model");
    expect(store.getCompletionModel()).toBe("fast-model");
  });

  it("does not use legacy Ollama model settings for another provider", () => {
    const store = new ModelSelectionStore(new MemoryState());
    mocked.legacyModels.chatModel = "ollama-chat";
    mocked.legacyModels.completionModel = "ollama-completion";
    mocked.config.provider = "openai-compatible";

    expect(store.getChatModel()).toBe("");
    expect(store.getCompletionModel()).toBe("");

    mocked.config.provider = "ollama";
    expect(store.getChatModel()).toBe("ollama-chat");
    expect(store.getCompletionModel()).toBe("ollama-completion");
  });
});
