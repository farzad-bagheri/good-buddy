import { ProviderModel } from "../types";

export interface GenerateResponse {
  response?: string;
}

export interface ChatResponse {
  message?: { content?: string };
}

export interface ListModelsResponse {
  models?: ProviderModel[];
}