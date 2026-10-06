import { getGoodBuddyConfig } from "@/config";
import { Request } from "@/gateway";
import {
  GoodBuddyProvider,
  ProviderModel,
  type ChatOptions,
  type ChatResponse,
  type GenerateOptions,
} from "@/provider";

interface ChatCompletionResponse {
  choices?: {
    message?: { content?: string };
    delta?: { content?: string };
    finish_reason?: string | null;
  }[];
}

interface ModelsResponse {
  data?: { id?: string }[];
}

export class OpenAICompatibleProvider implements GoodBuddyProvider {
  private readonly request: Request;

  constructor() {
    const config = getGoodBuddyConfig();
    const baseUrl = config.openAICompatibleEndpoint.endsWith("/")
      ? config.openAICompatibleEndpoint
      : `${config.openAICompatibleEndpoint}/`;
    const apiKey = config.openAICompatibleApiKey.trim();
    this.request = new Request(
      baseUrl,
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    );
  }

  async generate(
    options: GenerateOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    const generationOptions = options.options ?? {};
    const body = {
      model: options.model,
      messages: [{ role: "user", content: options.prompt }],
      stream: false,
      ...(typeof generationOptions.temperature === "number" && {
        temperature: generationOptions.temperature,
      }),
      ...(typeof generationOptions.top_p === "number" && {
        top_p: generationOptions.top_p,
      }),
      ...(typeof generationOptions.num_predict === "number" && {
        max_tokens: generationOptions.num_predict,
      }),
      ...(generationOptions.stop !== undefined && {
        stop: generationOptions.stop,
      }),
    };
    const response = await this.request.post(
      "chat/completions",
      JSON.stringify(body),
      signal,
    );
    const json = await this.parseResponse<ChatCompletionResponse>(
      response,
      "chat/completions",
    );
    return json.choices?.[0]?.message?.content ?? "";
  }

  async chat(options: ChatOptions, signal?: AbortSignal): Promise<string> {
    const result = await this.chatWithMetadata(options, signal);
    return result.content;
  }

  async chatWithMetadata(
    options: ChatOptions,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const body = {
      model: options.model,
      messages: options.messages.map((message) => ({
        role: message.role,
        content: this.messageContent(message.content, message.images),
      })),
      stream: false,
      ...(options.format !== undefined && {
        response_format: this.responseFormat(options.format),
      }),
    };
    const response = await this.request.post(
      "chat/completions",
      JSON.stringify(body),
      signal,
    );
    const json = await this.parseResponse<ChatCompletionResponse>(
      response,
      "chat/completions",
    );
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      finishReason: json.choices?.[0]?.finish_reason ?? undefined,
    };
  }

  async chatStream(
    options: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const body = {
      model: options.model,
      messages: options.messages.map((message) => ({
        role: message.role,
        content: this.messageContent(message.content, message.images),
      })),
      stream: true,
      ...(options.format !== undefined && {
        response_format: this.responseFormat(options.format),
      }),
    };
    const response = await this.request.post(
      "chat/completions",
      JSON.stringify(body),
      signal,
    );
    if (!response.body) {
      throw new Error(
        "OpenAI-compatible API returned an empty streaming response body.",
      );
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";
    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") return;

      const json = this.parseJson<ChatCompletionResponse>(
        data,
        "streaming chat/completions",
      );
      const text = json.choices?.[0]?.delta?.content ?? "";
      if (text) {
        fullResponse += text;
        onChunk(text);
      }
    };

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        processLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer);
    return fullResponse;
  }

  async listModels(): Promise<ProviderModel[]> {
    const response = await this.request.get("models");
    const json = await this.parseResponse<ModelsResponse>(response, "models");
    if (!Array.isArray(json.data)) {
      throw new Error(
        "Invalid OpenAI-compatible model list: expected a data array.",
      );
    }

    return json.data.flatMap(({ id }) =>
      typeof id === "string"
        ? [
            {
              caption: id,
              name: id,
              model: id,
              details: {
                format: "openai-compatible",
                family: id,
                parameter_size: "",
                quantization_level: "",
                context_length: 0,
                embedding_length: 0,
              },
              capabilities: ["completion"],
            } satisfies ProviderModel,
          ]
        : [],
    );
  }

  private responseFormat(
    format: NonNullable<ChatOptions["format"]>,
  ): Record<string, unknown> {
    if (format === "json") return { type: "json_object" };
    return {
      type: "json_schema",
      json_schema: {
        name: "good_buddy_response",
        strict: true,
        schema: format,
      },
    };
  }

  private messageContent(
    content: string,
    images: ChatOptions["messages"][number]["images"],
  ): string | Record<string, unknown>[] {
    if (!images?.length) return content;
    return [
      { type: "text", text: content },
      ...images.map((image) => ({
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.data}`,
        },
      })),
    ];
  }

  private async parseResponse<T>(
    response: Response,
    endpoint: string,
  ): Promise<T> {
    return this.parseJson<T>(await response.text(), endpoint);
  }

  private parseJson<T>(response: string, endpoint: string): T {
    try {
      return JSON.parse(response) as T;
    } catch (error) {
      const preview = response.replace(/\s+/g, " ").slice(0, 300);
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid JSON response from ${endpoint}: ${reason}. Response begins: ${JSON.stringify(preview)}`,
        { cause: error },
      );
    }
  }
}
