import { describe, expect, it, vi } from "vitest";

import { parseJsonResponse, processStreamLine, stripThinking } from "./utils";

describe("stripThinking", () => {
  it("removes XML-style reasoning content from model output", () => {
    expect(stripThinking("<think>Hidden reasoning</think>hello")).toBe("hello");
    expect(stripThinking("hello")).toBe("hello");
  });
});

describe("parseJsonResponse", () => {
  it("parses a valid JSON payload", () => {
    const parsed = parseJsonResponse<{ message: { content: string } }>(
      JSON.stringify({ message: { content: "hi" } }),
      "/api/chat",
    );

    expect(parsed.message.content).toBe("hi");
  });

  it("throws a helpful error when JSON is malformed", () => {
    expect(() => parseJsonResponse("not json", "/api/chat")).toThrow(
      /Invalid JSON response from \/api\/chat/i,
    );
  });
});

describe("processStreamLine", () => {
  it("extracts text and calls the chunk callback for each line", () => {
    const onChunk = vi.fn();

    const result = processStreamLine(
      JSON.stringify({ message: { content: "chunk one" } }),
      (json) => (json as { message?: { content?: string } }).message?.content ?? "",
      onChunk,
    );

    expect(result).toBe("chunk one");
    expect(onChunk).toHaveBeenCalledWith("chunk one");
  });
});
