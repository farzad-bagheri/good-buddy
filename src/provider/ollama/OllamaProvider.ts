import { getGoodBuddyConfig } from "@/config";
import { Request } from "@/gateway";
import {
  GoodBuddyProvider,
  type ChatOptions,
  type GenerateOptions,
} from "@/provider";
import type {
  ChatResponse,
  GenerateResponse,
  ListModelsResponse,
} from "./types";
import { parseJsonResponse, processStreamLine, stripThinking } from "./utils";

/**
 * Minimal provider for the Ollama HTTP API
 */
export class OllamaProvider implements GoodBuddyProvider {
  private request: Request;

  constructor() {
    this.request = new Request(getGoodBuddyConfig().endpoint);
  }

  /**
   * Generates text based on the provided options.
   * @param options The options for text generation.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The generated text.
   */
  async generate(
    options: GenerateOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    const { keepAlive, ...rest } = options;
    const body = JSON.stringify({
      ...rest,
      stream: false,
      keep_alive: keepAlive ?? "10m",
    });
    const response = await this.request.post("/api/generate", body, signal);
    const responseText = await response.text();
    const json = parseJsonResponse<GenerateResponse>(
      responseText,
      "/api/generate",
    );
    return stripThinking(json.response ?? "");
  }

  /**
   * Sends a chat request based on the provided options.
   * @param options The options for the chat request.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The chat response text.
   */
  async chat(options: ChatOptions, signal?: AbortSignal): Promise<string> {
    const body = JSON.stringify({
      ...options,
      stream: false,
      think: options.think ?? false,
    });
    const response = await this.request.post("/api/chat", body, signal);
    const responseText = await response.text();
    const json = parseJsonResponse<ChatResponse>(responseText, "/api/chat");
    return stripThinking(json.message?.content ?? "");
  }

  /**
   * Streams chat tokens as they arrive.
   * @param options The options for the chat request.
   * @param onChunk A callback function invoked with each incremental piece of text.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The final chat response text.
   */
  async chatStream(
    options: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const body = JSON.stringify({
      ...options,
      stream: true,
      think: options.think ?? false,
    });

    return this.streamRequest("/api/chat", body, onChunk, signal);
  }

  /**
   * Lists the available models from the Ollama server.
   * @returns An array of model names.
   */
  async listModels(): Promise<string[]> {
    const response = await this.request.get("/api/tags");
    const responseText = await response.text();
    const json = parseJsonResponse<ListModelsResponse>(
      responseText,
      "/api/tags",
    );

    return (json.models ?? []).map((m: { name: string }) => m.name);
  }

  /**
   * Parses Ollama's newline-delimited JSON streaming responses, invoking onChunk per fragment.
   * @param path The API endpoint path.
   * @param body The request body as a JSON string.
   * @param extractText A function that extracts text from the parsed JSON object.
   * @param onChunk A callback function invoked with each extracted text chunk.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The concatenated text from all processed lines.
   */
  private async streamRequest(
    path: string,
    body: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request.post(path, body, signal);
    if (!response || !response.body) {
      throw new Error("Ollama returned an empty streaming response body.");
    }

    const extractText = (json: unknown) =>
      (json as ChatResponse).message?.content ?? "";

    // Initialize the full response text and a buffer for streaming chunks.
    let fullResponse = "";
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += Buffer.from(chunk).toString("utf8");
      let newlineIndex: number;
      // Process each complete line in the buffer.
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1); // Remove the processed line from the buffer.
        if (line) {
          fullResponse += processStreamLine(line, extractText, onChunk);
        }
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      fullResponse += processStreamLine(remaining, extractText, onChunk);
    }
    return fullResponse;
  }
}
