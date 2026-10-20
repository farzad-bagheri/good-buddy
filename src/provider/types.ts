export interface ProviderModel {
  caption: string;
  name: string;
  model: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
    context_length: number;
    embedding_length: number;
  };
  capabilities: ("completion" | "tools" | "thinking")[];
}

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
  images?: ChatImage[];
  extras?: ResponseExtras;
}

export interface ResponseExtras {
  suggestions: string[];
  files: FileReference[];
  artifacts: Artifact[];
}

export interface FileReference {
  name: string;
  path: string;
}

export interface CodeArtifact {
  type: "code";
  title: string;
  language: string;
  content: string;
}

export interface SvgArtifact {
  type: "svg";
  title: string;
  language: "svg";
  content: string;
}

export type Artifact = CodeArtifact | SvgArtifact;

export function createEmptyResponseExtras(): ResponseExtras {
  return { suggestions: [], files: [], artifacts: [] };
}

export function responseExtrasSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 59 },
        minItems: 0,
        maxItems: 2,
      },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            path: { type: "string", minLength: 1 },
          },
          required: ["name", "path"],
          additionalProperties: false,
        },
        minItems: 0,
        maxItems: 5,
      },
      artifacts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["code", "svg"] },
            title: { type: "string", minLength: 1, maxLength: 100 },
            language: { type: "string", minLength: 1, maxLength: 40 },
            content: { type: "string", minLength: 1, maxLength: 100000 },
          },
          required: ["type", "title", "language", "content"],
          additionalProperties: false,
        },
        minItems: 0,
        maxItems: 3,
      },
    },
    required: ["suggestions", "files", "artifacts"],
    additionalProperties: false,
  };
}

export function isResponseExtras(value: unknown): value is ResponseExtras {
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).every((key) =>
      ["suggestions", "files", "artifacts"].includes(key),
    ) &&
    isSuggestions(value.suggestions) &&
    isFileReferences(value.files) &&
    isArtifacts(value.artifacts)
  );
}

function isSuggestions(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 2 &&
    value.every(
      (suggestion) =>
        typeof suggestion === "string" &&
        !!suggestion.trim() &&
        suggestion.length < 60,
    )
  );
}

function isFileReferences(value: unknown): value is FileReference[] {
  return (
    Array.isArray(value) &&
    value.length <= 5 &&
    value.every(
      (file) =>
        isRecord(file) &&
        typeof file.name === "string" &&
        !!file.name.trim() &&
        typeof file.path === "string" &&
        !!file.path.trim() &&
        Object.keys(file).every((key) => ["name", "path"].includes(key)),
    )
  );
}

function isArtifacts(value: unknown): value is Artifact[] {
  return (
    Array.isArray(value) &&
    value.length <= 3 &&
    value.every(isArtifact)
  );
}

function isArtifact(value: unknown): value is Artifact {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 100 ||
    typeof value.language !== "string" ||
    !value.language.trim() ||
    value.language.length > 40 ||
    typeof value.content !== "string" ||
    !value.content.trim() ||
    value.content.length > 100000 ||
    Object.keys(value).some(
      (key) => !["type", "title", "language", "content"].includes(key),
    )
  ) {
    return false;
  }
  if (value.type === "code") return true;
  return value.type === "svg" && value.language === "svg";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ChatImage {
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  /** Base64-encoded image bytes without a data URL prefix. */
  data: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  think?: boolean;
  format?: "json" | Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  finishReason?: string;
}
