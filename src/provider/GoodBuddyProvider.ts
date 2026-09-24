import { ChatOptions, GenerateOptions } from "./types";

/**
 * Abstract base class for Good Buddy providers, defining the interface for text generation, chat, and model listing.
 */
export abstract class GoodBuddyProvider {
  /**
   * Generates text based on the provided options.
   * @param options The options for text generation.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The generated text.
   */
  abstract generate(
    options: GenerateOptions,
    signal?: AbortSignal,
  ): Promise<string>;

  /**
   * Sends a chat request based on the provided options.
   * @param options The options for the chat request.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The chat response text.
   */
  abstract chat(options: ChatOptions, signal?: AbortSignal): Promise<string>;

  /**
   * Streams chat tokens as they arrive.
   * @param options The options for the chat request.
   * @param onChunk A callback function invoked with each incremental piece of text.
   * @param signal An optional AbortSignal to cancel the request.
   * @returns The final chat response text.
   */
  abstract chatStream(
    options: ChatOptions,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string>;

  /**
   * Lists the available models from the provider server.
   * @returns An array of model names.
   */
  abstract listModels(): Promise<string[]>;
}
