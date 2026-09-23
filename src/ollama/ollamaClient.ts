import {
  ChatOptions,
  ChatResponse,
  GenerateOptions,
  GenerateResponse,
} from "./types";
import { parseJsonResponse, processStreamLine, stripThinking } from "./utils";

/**
 * Minimal client for the Ollama HTTP API (generate + chat, non-streaming).
 */
export class OllamaClient {
  constructor(private baseUrl: string) {}

  async generate(opts: GenerateOptions, signal?: AbortSignal): Promise<string> {
    const { keepAlive, ...rest } = opts;
    const body = JSON.stringify({
      ...rest,
      stream: false,
      keep_alive: keepAlive ?? "10m",
    });
    const res = await this.post("/api/generate", body, signal);
    const json = parseJsonResponse<GenerateResponse>(res, "/api/generate");
    return stripThinking(json.response ?? "");
  }

  async chat(opts: ChatOptions, signal?: AbortSignal): Promise<string> {
    const body = JSON.stringify({
      ...opts,
      stream: false,
      think: opts.think ?? false,
    });
    const res = await this.post("/api/chat", body, signal);
    const json = parseJsonResponse<ChatResponse>(res, "/api/chat");
    return stripThinking(json.message?.content ?? "");
  }

  // Streams chat tokens as they arrive; onChunk receives each incremental piece of text.
  async chatStream(
    opts: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const body = JSON.stringify({
      ...opts,
      stream: true,
      think: opts.think ?? false,
    });
    return this.streamRequest(
      "/api/chat",
      body,
      (json) =>
        (json as { message?: { content?: string } }).message?.content ?? "",
      onChunk,
      signal,
    );
  }

  async listModels(): Promise<string[]> {
    const res = await this.get("/api/tags");
    const json = JSON.parse(res);
    return (json.models ?? []).map((m: { name: string }) => m.name);
  }

  private post(
    path: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.request("POST", path, body, signal);
  }

  private get(path: string): Promise<string> {
    return this.request("GET", path);
  }

  private async request(
    method: string,
    path: string,
    body?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
      signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}): ${text}`);
    }
    return text;
  }

  // Parses Ollama's newline-delimited JSON streaming responses, invoking onChunk per fragment.
  private async streamRequest(
    path: string,
    body: string,
    extractText: (json: unknown) => string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `Ollama request failed (${response.status}): ${await response.text()}`,
      );
    }
    if (!response.body) {
      throw new Error("Ollama returned an empty streaming response body.");
    }

    let full = "";
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += Buffer.from(chunk).toString("utf8");
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          full += processStreamLine(line, extractText, onChunk);
        }
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      full += processStreamLine(remaining, extractText, onChunk);
    }
    return full;
  }
}
