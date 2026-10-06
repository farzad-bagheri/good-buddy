export interface VsCodeApi {
  postMessage(message: Record<string, unknown>): void;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export type ProviderStatus =
  | "checking"
  | "unavailable"
  | "no-models"
  | "models-unselected"
  | "models-missing"
  | "ready";

export interface ProviderStatusInfo {
  status: ProviderStatus;
  provider: "ollama" | "openai-compatible";
  endpoint: string;
  chatModel: string;
  completionModel: string;
  missingModels: string[];
  artworkUri: string;
}

export type TimelineItem =
  | {
      id: string;
      kind: "message";
      role: "user" | "assistant" | "error";
      text: string;
      html?: string;
      historyIndex?: number;
      suggestions?: string[];
      files?: { name: string; path: string }[];
    }
  | { id: string; kind: "toolStatus"; text: string }
  | {
      id: string;
      kind: "writeProposal";
      proposalId: string;
      path: string;
      diff: string;
      status?: string;
    }
  | {
      id: string;
      kind: "commandProposal";
      commandId: string;
      command: string;
      autoApproved: boolean;
      output: string;
      status?: string;
    };

export type NewTimelineItem =
  | Omit<Extract<TimelineItem, { kind: "message" }>, "id">
  | Omit<Extract<TimelineItem, { kind: "toolStatus" }>, "id">
  | Omit<Extract<TimelineItem, { kind: "writeProposal" }>, "id">
  | Omit<Extract<TimelineItem, { kind: "commandProposal" }>, "id">;

export interface Attachment {
  name: string;
  path: string;
}

export interface AttachmentState {
  attached: Attachment[];
  activeDocument?: Attachment;
}

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
