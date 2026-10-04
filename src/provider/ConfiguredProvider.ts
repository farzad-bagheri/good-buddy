import { getGoodBuddyConfig } from "@/config";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { OllamaProvider } from "./ollama";
import {
  GoodBuddyProvider,
  type ChatOptions,
  type ChatResponse,
  type GenerateOptions,
  type ProviderModel,
} from "./index";

export class ConfiguredProvider implements GoodBuddyProvider {
  async generate(
    options: GenerateOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.createProvider().generate(options, signal);
  }

  async chat(options: ChatOptions, signal?: AbortSignal): Promise<string> {
    return this.createProvider().chat(options, signal);
  }

  async chatWithMetadata(
    options: ChatOptions,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    return this.createProvider().chatWithMetadata(options, signal);
  }

  async chatStream(
    options: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.createProvider().chatStream(options, onChunk, signal);
  }

  async listModels(): Promise<ProviderModel[]> {
    return this.createProvider().listModels();
  }

  private createProvider(): GoodBuddyProvider {
    return getGoodBuddyConfig().provider === "openai-compatible"
      ? new OpenAICompatibleProvider()
      : new OllamaProvider();
  }
}
