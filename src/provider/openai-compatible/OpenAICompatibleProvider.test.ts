import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config", () => ({
  getGoodBuddyConfig: () => ({
    openAICompatibleEndpoint: "http://localhost:1234/v1",
    openAICompatibleApiKey: "test-key",
  }),
}));

import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends OpenAI-compatible chat requests with optional auth and JSON schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: "hello" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const schema = {
      type: "object",
      properties: { answer: { type: "string" } },
    };

    const provider = new OpenAICompatibleProvider();
    const response = await provider.chat({
      model: "local-model",
      messages: [
        {
          role: "user",
          content: "Say hello",
          displayContent: "Say something",
        },
      ],
      format: schema,
    });

    expect(response).toBe("hello");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("chat/completions", "http://localhost:1234/v1/"),
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "local-model",
          messages: [{ role: "user", content: "Say hello" }],
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "good_buddy_response",
              strict: true,
              schema,
            },
          },
        }),
      }),
    );
  });

  it("returns the provider finish reason with the chat content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: { content: "partial" },
                finish_reason: "length",
              },
            ],
          }),
      }),
    );

    await expect(
      new OpenAICompatibleProvider().chatWithMetadata({
        model: "local-model",
        messages: [{ role: "user", content: "Say hello" }],
      }),
    ).resolves.toEqual({ content: "partial", finishReason: "length" });
  });

  it("lists model IDs in Good Buddy's provider model shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ data: [{ id: "local-model" }] }),
      }),
    );

    await expect(new OpenAICompatibleProvider().listModels()).resolves.toMatchObject([
      {
        caption: "local-model",
        name: "local-model",
        model: "local-model",
        details: { format: "openai-compatible", family: "local-model" },
        capabilities: ["completion"],
      },
    ]);
  });

  it("streams content deltas from server-sent events", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"there"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: (async function* () {
          for (const chunk of chunks) yield encoder.encode(chunk);
        })(),
      }),
    );
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleProvider().chatStream(
      {
        model: "local-model",
        messages: [{ role: "user", content: "Say hello" }],
      },
      onChunk,
    );

    expect(result).toBe("Hello there");
    expect(onChunk.mock.calls).toEqual([["Hello "], ["there"]]);
  });

  it("maps completion requests and common Ollama generation options", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: "generated" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleProvider().generate({
      model: "local-model",
      prompt: "complete this",
      options: { temperature: 0.2, num_predict: 128, stop: ["\n"] },
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: "local-model",
      messages: [{ role: "user", content: "complete this" }],
      stream: false,
      temperature: 0.2,
      max_tokens: 128,
      stop: ["\n"],
    });
  });
});
