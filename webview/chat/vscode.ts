import type { VsCodeApi } from "./types";

declare function acquireVsCodeApi(): VsCodeApi;

// Falls back to a mock when opened directly in a browser (no VS Code host) for local UI dev.
function createMockVsCodeApi(): VsCodeApi {
  return {
    postMessage(message) {
      window.dispatchEvent(
        new CustomEvent("mock-vscode-message", { detail: message }),
      );
    },
  };
}

export const vscode: VsCodeApi =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : createMockVsCodeApi();
