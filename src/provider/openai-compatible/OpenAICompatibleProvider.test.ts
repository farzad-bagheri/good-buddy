import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  openAICompatibleEndpoint: "http://localhost:1234/v1",
  openAICompatibleApiKey: "test-key",
}));

vi.mock("@/config", () => ({
  getGoodBuddyConfig: () => config,
}));

import { ChatAgent } from "@/features/chat/agent/ChatAgent";
import type { ProviderModel } from "@/provider";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    config.openAICompatibleEndpoint = "http://localhost:1234/v1";
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
      allowJsonMode: true,
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

  it("uses JSON mode for OpenAI agent chat and parses the streamed response", async () => {
    config.openAICompatibleEndpoint = "https://api.openai.com/v1";
    const envelope = JSON.stringify({
      type: "final",
      title: "Availability",
      response: "Yes, I am available.",
      tool: null,
      autoApprove: false,
      arguments: {},
      extras: { suggestions: [], files: [], artifacts: [] },
    });
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      if (request.response_format?.type !== "json_object") {
        return new Response(
          JSON.stringify({ error: { message: "'allOf' is not permitted." } }),
          { status: 400 },
        );
      }
      const event = JSON.stringify({
        choices: [{ delta: { content: envelope }, finish_reason: "stop" }],
      });
      return new Response(`data: ${event}\n\ndata: [DONE]\n\n`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const agent = new ChatAgent(
      new OpenAICompatibleProvider(),
      { appendLine: vi.fn() },
      { projectContext: vi.fn().mockResolvedValue("project") } as never,
      { list: () => [], execute: vi.fn() } as never,
      { onToolStatus: vi.fn(), onModelStatus: vi.fn() },
    );
    const model: ProviderModel = {
      caption: "gpt-4o",
      name: "gpt-4o",
      model: "gpt-4o",
      details: {
        format: "openai-compatible",
        family: "gpt-4o",
        parameter_size: "",
        quantization_level: "",
        context_length: 0,
        embedding_length: 0,
      },
      capabilities: ["completion"],
    };

    await expect(
      agent.run(
        [{ role: "user", content: "Are you available?" }],
        model,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      title: "Availability",
      response: "Yes, I am available.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      model: "gpt-4o",
      stream: true,
      response_format: { type: "json_object" },
    });
  });

  it("only switches OpenAI schemas to JSON mode when explicitly allowed", async () => {
    config.openAICompatibleEndpoint = "https://api.openai.com/v1/";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider();
    const options = {
      model: "gpt-4o",
      messages: [{ role: "user" as const, content: "Respond in JSON" }],
      format: { type: "object" },
    };

    await provider.chat(options);
    await provider.chat({ ...options, allowJsonMode: true });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toMatchObject({
      type: "json_schema",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({
      type: "json_object",
    });
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

  it("encodes image attachments using OpenAI-compatible image content parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: "A screenshot" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleProvider().chatWithMetadata({
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
        content: [
          { type: "text", text: "Describe this." },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,aGVsbG8=" },
          },
        ],
      },
    ]);
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
        capabilitiesUnknown: true,
      },
    ]);
  });

  it("reads vision support from LM Studio's native model list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        url.pathname === "/api/v1/models"
          ? {
              ok: true,
              text: async () =>
                JSON.stringify({
                  models: [
                    {
                      key: "acme/seer",
                      capabilities: { vision: true },
                      loaded_instances: [{ id: "acme/seer" }],
                    },
                    {
                      key: "google/gemma-4-26b-a4b",
                      capabilities: { vision: false },
                    },
                  ],
                }),
            }
          : {
              ok: true,
              text: async () =>
                JSON.stringify({
                  data: [{ id: "acme/seer" }, { id: "google/gemma-4-26b-a4b" }],
                }),
            },
      ),
    );

    const models = await new OpenAICompatibleProvider().listModels();
    expect(models.map((m) => [m.model, m.capabilities, m.capabilitiesUnknown])).toEqual([
      ["acme/seer", ["completion", "vision"], undefined],
      ["google/gemma-4-26b-a4b", ["completion"], undefined],
    ]);
  });

  it("detects vision support from metadata or well-known names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              { id: "gpt-4o" },
              { id: "text-only", architecture: { input_modalities: ["text"] } },
              { id: "custom", architecture: { input_modalities: ["text", "image"] } },
            ],
          }),
      }),
    );

    const models = await new OpenAICompatibleProvider().listModels();
    expect(models.map((m) => [m.model, m.capabilities, m.capabilitiesUnknown])).toEqual([
      ["gpt-4o", ["completion", "vision"], undefined],
      ["text-only", ["completion"], undefined],
      ["custom", ["completion", "vision"], undefined],
    ]);
  });

  it("streams content deltas from server-sent events", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"there"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
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

  it("returns finish metadata while streaming", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: (async function* () {
          yield encoder.encode(
            'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":null}]}\n\n' +
              'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
          );
        })(),
      }),
    );

    await expect(
      new OpenAICompatibleProvider().chatStreamWithMetadata(
        {
          model: "local-model",
          messages: [{ role: "user", content: "Say hello" }],
        },
        vi.fn(),
      ),
    ).resolves.toEqual({ content: "answer", finishReason: "length" });
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
