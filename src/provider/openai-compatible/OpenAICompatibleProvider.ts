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
  data?: {
    id?: string;
    architecture?: { input_modalities?: string[] };
  }[];
}

// LM Studio's native /api/v1/models, which reports capabilities.vision.
interface NativeModelsResponse {
  models?: {
    key?: string;
    loaded_instances?: { id?: string }[];
    capabilities?: { vision?: boolean };
  }[];
}

// Standard /models responses carry no capabilities, so fall back to
// well-known vision model names when nothing explicit is reported.
const VISION_MODEL_NAME =
  /vision|llava|pixtral|(^|[-/:._])vl([-/:._]|$)|gpt-4o|gpt-4\.1|gpt-5|gemini|claude|gemma-?[34]|llama-?4/i;

function detectVision(
  model: NonNullable<ModelsResponse["data"]>[number],
  nativeVision: Map<string, boolean>,
) {
  const id = model.id ?? "";
  const native = nativeVision.get(id);
  if (native !== undefined) return native;
  const modalities = model.architecture?.input_modalities;
  if (Array.isArray(modalities)) return modalities.includes("image");
  return VISION_MODEL_NAME.test(id) ? true : undefined;
}

export class OpenAICompatibleProvider implements GoodBuddyProvider {
  private readonly request: Request;
  private readonly isOpenAI: boolean;

  constructor() {
    const config = getGoodBuddyConfig();
    const baseUrl = config.openAICompatibleEndpoint.endsWith("/")
      ? config.openAICompatibleEndpoint
      : `${config.openAICompatibleEndpoint}/`;
    this.isOpenAI = new URL(baseUrl).hostname === "api.openai.com";
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
        response_format: this.responseFormat(options.format, options.allowJsonMode),
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
    const result = await this.chatStreamWithMetadata(options, onChunk, signal);
    return result.content;
  }

  async chatStreamWithMetadata(
    options: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const body = {
      model: options.model,
      messages: options.messages.map((message) => ({
        role: message.role,
        content: this.messageContent(message.content, message.images),
      })),
      stream: true,
      ...(options.format !== undefined && {
        response_format: this.responseFormat(options.format, options.allowJsonMode),
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
    let finishReason: string | undefined;
    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") return;

      const json = this.parseJson<ChatCompletionResponse>(
        data,
        "streaming chat/completions",
      );
      finishReason =
        json.choices?.[0]?.finish_reason ?? finishReason;
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
    return { content: fullResponse, finishReason };
  }

  async listModels(): Promise<ProviderModel[]> {
    const response = await this.request.get("models");
    const json = await this.parseResponse<ModelsResponse>(response, "models");
    if (!Array.isArray(json.data)) {
      throw new Error(
        "Invalid OpenAI-compatible model list: expected a data array.",
      );
    }

    const nativeVision = await this.nativeVisionSupport();
    return json.data.flatMap((entry) => {
      const { id } = entry;
      if (typeof id !== "string") return [];
      const vision = detectVision(entry, nativeVision);
      return [
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
          capabilities: vision ? ["completion", "vision"] : ["completion"],
          ...(vision === undefined && { capabilitiesUnknown: true }),
        } satisfies ProviderModel,
      ];
    });
  }

  /** Best effort: only LM Studio serves this endpoint; other servers are ignored. */
  private async nativeVisionSupport(): Promise<Map<string, boolean>> {
    const support = new Map<string, boolean>();
    try {
      const response = await this.request.get("/api/v1/models");
      const json = this.parseJson<NativeModelsResponse>(
        await response.text(),
        "/api/v1/models",
      );
      for (const model of json.models ?? []) {
        const vision = model.capabilities?.vision;
        if (typeof vision !== "boolean") continue;
        const ids = [model.key, ...(model.loaded_instances ?? []).map((i) => i.id)];
        for (const id of ids) if (id) support.set(id, vision);
      }
    } catch {
      // Not LM Studio, or the endpoint is unavailable.
    }
    return support;
  }

  private responseFormat(
    format: NonNullable<ChatOptions["format"]>,
    allowJsonMode?: boolean,
  ): Record<string, unknown> {
    // The agent schema uses constructs that OpenAI's strict schema subset rejects.
    if (format === "json" || (this.isOpenAI && allowJsonMode)) {
      return { type: "json_object" };
    }
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
