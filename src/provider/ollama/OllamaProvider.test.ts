import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config", () => ({
  getGoodBuddyConfig: () => ({
    endpoint: "http://localhost:11434",
  }),
}));

import { OllamaProvider } from "./OllamaProvider";

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns clean chat text after stripping hidden reasoning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            message: {
              content: "<think>hidden reasoning</think> Hello from Ollama",
            },
          }),
      }),
    );

    const provider = new OllamaProvider();
    const response = await provider.chat({
      model: "qwen3:8b",
      messages: [{ role: "user", content: "Say hello" }],
    });

    expect(response).toBe("Hello from Ollama");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL("/api/chat", "http://localhost:11434"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
