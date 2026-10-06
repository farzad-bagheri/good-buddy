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

  it("sends a structured response schema to Ollama", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ message: { content: "{}" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const format = {
      type: "object",
      properties: { type: { type: "string", enum: ["final", "tool_call"] } },
    };

    const provider = new OllamaProvider();
    await provider.chat({
      model: "qwen3:8b",
      messages: [{ role: "user", content: "Say hello" }],
      format,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).format).toEqual(format);
  });

  it("returns Ollama's finish reason with the chat content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            message: { content: "partial" },
            done_reason: "length",
          }),
      }),
    );

    await expect(
      new OllamaProvider().chatWithMetadata({
        model: "qwen3:8b",
        messages: [{ role: "user", content: "Say hello" }],
      }),
    ).resolves.toEqual({ content: "partial", finishReason: "length" });
  });

  it("sends image bytes in Ollama's native images field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ message: { content: "A screenshot" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OllamaProvider().chat({
      model: "vision-model",
      messages: [
        {
          role: "user",
          content: "Describe this.",
          images: [
            {
              name: "clip.png",
              mimeType: "image/png",
              data: "aGVsbG8=",
            },
          ],
        },
      ],
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual([
      {
        role: "user",
        content: "Describe this.",
        images: ["aGVsbG8="],
      },
    ]);
  });
});
