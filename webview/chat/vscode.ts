import type { VsCodeApi } from "./types";

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode = acquireVsCodeApi();
