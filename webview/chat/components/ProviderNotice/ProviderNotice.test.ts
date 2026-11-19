import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderStatusInfo } from "../../types";
import { ProviderSetupDialog } from "../ProviderSetupDialog";
import { ProviderNotice } from "./ProviderNotice";

const provider: ProviderStatusInfo = {
  status: "models-missing",
  provider: "ollama",
  endpoint: "http://localhost:11434",
  chatModel: "new-model",
  completionModel: "removed-model",
  missingModels: ["removed-model"],
  artworkUri: "",
};

function renderNotice(status: ProviderStatusInfo) {
  return renderToStaticMarkup(createElement(ProviderNotice, {
    provider: status,
    compact: false,
    onOpenSetup: () => {},
  }));
}

describe("chat provider notice", () => {
  it("does not interrupt working chat for a missing or unselected completion model", () => {
    expect(renderNotice(provider)).toBe("");
    expect(renderNotice({
      ...provider,
      status: "models-unselected",
      completionModel: "",
      missingModels: [],
    })).toBe("");
  });

  it("reports missing or unselected chat models even if completion also needs setup", () => {
    expect(renderNotice({
      ...provider,
      chatModel: "removed-model",
    })).toContain("selected chat model is no longer available");
    expect(renderNotice({
      ...provider,
      chatModel: "",
    })).toContain("Choose a chat model");
    expect(renderNotice({
      ...provider,
      status: "models-unselected",
      chatModel: "",
      missingModels: [],
    })).toContain("Choose a chat model");
  });

  it("still reports server connection and empty model list problems", () => {
    expect(renderNotice({ ...provider, status: "unavailable" })).toContain("cannot connect");
    expect(renderNotice({ ...provider, status: "no-models" })).toContain("no downloaded models");
  });

  it("identifies which selection is missing in model setup", () => {
    const markup = renderToStaticMarkup(createElement(ProviderSetupDialog, {
      provider,
      models: [],
      onClose: () => {},
      onCheck: () => {},
      onSelectChatModel: () => {},
      onSelectCompletionModel: () => {},
      onOpenSettings: () => {},
    }));
    expect(markup).toContain("Inline completion: removed-model");
    expect(markup).not.toContain("Chat: new-model");
  });
});
