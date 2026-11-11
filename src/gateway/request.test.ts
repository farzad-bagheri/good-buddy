import { afterEach, describe, expect, it, vi } from "vitest";

import { Request } from "./request";

describe("Request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts JSON payloads using the configured base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost:11434");
    const payload = JSON.stringify({ model: "qwen3:8b", messages: [{ role: "user", content: "hi" }] });

    const response = await request.post("/api/chat", payload);

    expect(response).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].toString()).toBe("http://localhost:11434/api/chat");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  });

  it("adds configured headers to requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await new Request("http://localhost:1234/v1", {
      Authorization: "Bearer example-key",
    }).get("models");

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer example-key",
    });
  });

  it("throws when the remote HTTP call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "",
      }),
    );

    const request = new Request("http://localhost:11434");

    await expect(request.get("/api/tags")).rejects.toThrow(
      "Request failed (500) for /api/tags",
    );
  });

  it("includes the OpenAI API's diagnostic message in the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Invalid schema: 'allOf' is not permitted.",
              type: "invalid_request_error",
            },
          }),
          { status: 400 },
        ),
      ),
    );

    await expect(
      new Request("https://example.test/v1/").post("chat/completions", "{}"),
    ).rejects.toThrow(
      "Request failed (400) for chat/completions: Invalid schema: 'allOf' is not permitted.",
    );
  });

  it.each([
    ['{"error":"model not found"}', "model not found"],
    ["  Server unavailable\nTry again  ", "Server unavailable Try again"],
    ['{"detail":"invalid request"}', '{"detail":"invalid request"}'],
  ])("includes other server error responses", async (body, detail) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 400 })),
    );

    await expect(new Request("https://example.test/").get("models")).rejects.toThrow(
      `Request failed (400) for models: ${detail}`,
    );
  });

  it("limits the length of an error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("x".repeat(2100), { status: 400 })),
    );

    await expect(new Request("https://example.test/").get("models")).rejects.toThrow(
      `Request failed (400) for models: ${"x".repeat(2000)}...`,
    );
  });

  it("reports when an error response cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => {
          throw new Error("connection interrupted");
        },
      }),
    );

    await expect(new Request("https://example.test/").get("models")).rejects.toThrow(
      "Request failed (400) for models: Could not read error response: connection interrupted",
    );
  });
});
