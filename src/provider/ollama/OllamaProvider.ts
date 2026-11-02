import { getGoodBuddyConfig } from "@/config";
import { Request } from "@/gateway";
import {
  GoodBuddyProvider,
  ProviderModel,
  type ChatResponse as ChatResponseMetadata,
  type ChatOptions,
  type GenerateOptions,
} from "@/provider";
import type {
  ChatResponse,
  GenerateResponse,
  ListModelsResponse,
  ShowModelResponse,
} from "./types";
import {
  makeModelCaption,
  parseJsonResponse,
  processStreamLine,
  stripThinking,
} from "./utils";

/**
 * Minimal provider for the Ollama HTTP API
 */
export class OllamaProvider implements GoodBuddyProvider {
  private request: Request;
  private capabilityCache = new Map<
    string,
    Pick<ProviderModel, "capabilities">
  >();
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
    const result = await this.chatWithMetadata(options, signal);
    return result.content;
  }

  async chatWithMetadata(
    options: ChatOptions,
    signal?: AbortSignal,
  ): Promise<ChatResponseMetadata> {
    const body = JSON.stringify({
      ...options,
      messages: this.messagesWithImages(options),
      stream: false,
      think: options.think ?? false,
    });
    const response = await this.request.post("/api/chat", body, signal);
    const responseText = await response.text();
    const json = parseJsonResponse<ChatResponse>(responseText, "/api/chat");
    return {
      content: stripThinking(json.message?.content ?? ""),
      finishReason: json.done_reason,
    };
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
    const result = await this.chatStreamWithMetadata(options, onChunk, signal);
    return result.content;
  }

  async chatStreamWithMetadata(
    options: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResponseMetadata> {
    const body = JSON.stringify({
      ...options,
      messages: this.messagesWithImages(options),
      stream: true,
      think: options.think ?? false,
    });

    return this.streamRequest("/api/chat", body, onChunk, signal);
  }

  /**
   * Lists the available models from the Ollama server.
   * @returns An array of model names.
   */
  async listModels(): Promise<ProviderModel[]> {
    const response = await this.request.get("/api/tags");
    const responseText = await response.text();
    const json = parseJsonResponse<ListModelsResponse>(
      responseText,
      "/api/tags",
    );

    return Promise.all(
      (json.models ?? []).map(async ({ digest, ...m }) => ({
        ...m,
        ...(await this.modelCapabilities(m.model, digest)),
        caption: makeModelCaption(m),
      })),
    );
  }

  /**
   * /api/tags omits capabilities, so ask /api/show. Failures (for example older
   * Ollama versions without a capabilities field) mark the model as unknown.
   */
  private async modelCapabilities(
    model: string,
    digest?: string,
  ): Promise<Pick<ProviderModel, "capabilities" | "capabilitiesUnknown">> {
    const cacheKey = digest ? `${model}@${digest}` : undefined;
    const cached = cacheKey && this.capabilityCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.request.post(
        "/api/show",
        JSON.stringify({ model }),
      );
      const json = parseJsonResponse<ShowModelResponse>(
        await response.text(),
        "/api/show",
      );
      if (!Array.isArray(json.capabilities)) {
        return { capabilities: [], capabilitiesUnknown: true };
      }
      const result: Pick<ProviderModel, "capabilities"> = {
        capabilities: json.capabilities.filter(
          (capability): capability is ProviderModel["capabilities"][number] =>
            ["completion", "tools", "thinking", "vision"].includes(capability),
        ),
      };
      if (cacheKey) this.capabilityCache.set(cacheKey, result);
      return result;
    } catch {
      return { capabilities: [], capabilitiesUnknown: true };
    }
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
  ): Promise<ChatResponseMetadata> {
    const response = await this.request.post(path, body, signal);
    if (!response || !response.body) {
      throw new Error("Ollama returned an empty streaming response body.");
    }

    const extractText = (json: unknown) =>
      (json as ChatResponse).message?.content ?? "";

    // Initialize the full response text and a buffer for streaming chunks.
    let fullResponse = "";
    let buffer = "";
    const decoder = new TextDecoder();
    let finishReason: string | undefined;
    const processLine = (line: string): string => {
      const text = processStreamLine(line, extractText, onChunk);
      const json = parseJsonResponse<ChatResponse>(line, path);
      finishReason = json.done_reason ?? finishReason;
      return text;
    };
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex: number;
      // Process each complete line in the buffer.
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1); // Remove the processed line from the buffer.
        if (line) {
          fullResponse += processLine(line);
        }
      }
    }

    buffer += decoder.decode();
    const remaining = buffer.trim();
    if (remaining) {
      fullResponse += processLine(remaining);
    }
    return {
      content: stripThinking(fullResponse),
      finishReason,
    };
  }

  private messagesWithImages(
    options: ChatOptions,
  ): Array<{ role: string; content: string; images?: string[] }> {
    return options.messages.map(({ role, content, images }) => ({
      role,
      content,
      ...(images?.length && { images: images.map((image) => image.data) }),
    }));
  }
}
