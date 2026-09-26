export interface GenerateOptions {
  model: string;
  prompt: string;
  /**
   * The text to append after the generated content.
   */
  suffix?: string;
  stream?: boolean;
  think?: boolean;
  /**
   * If true, the raw response from the model will be returned without any post-processing.
   */
  raw?: boolean;
  /**
   * The duration for which the model should keep the context alive.
   * @example "10m"
   */
  keepAlive?: string;
  options?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  displayContent?: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  think?: boolean;
}
