import { ProviderModel } from "../types";

export interface GenerateResponse {
  response?: string;
}

export interface ChatResponse {
  message?: { content?: string };
  done_reason?: string;
}

export interface ListModelsResponse {
  models?: ProviderModel[];
}