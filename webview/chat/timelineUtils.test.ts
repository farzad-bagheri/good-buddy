import { describe, expect, it } from "vitest";
import type { TimelineItem } from "./types";
import {
  appendCommandOutput,
  appendCommandProposal,
  appendTimelineItem,
  completeCommandProposal,
  mapHistoryToTimelineItems,
  updateAssistantMessage,
  updateWriteProposal,
} from "./timelineUtils";

const assistantItem: TimelineItem = {
  id: "assistant-1",
  kind: "message",
  role: "assistant",
  text: "Answer",
};

const proposalItem: TimelineItem = {
  id: "proposal-1",
  kind: "writeProposal",
  proposalId: "write-1",
  path: "src/example.ts",
  diff: "diff",
};

const commandItem: TimelineItem = {
  id: "command-1",
  kind: "commandProposal",
  commandId: "run-1",
  command: "npm test",
  autoApproved: false,
  output: "",
};

describe("timeline utilities", () => {
  it("maps host history into timeline messages", () => {
    expect(
      mapHistoryToTimelineItems([
        {
          role: "assistant",
          content: "<p>Answer</p>",
          historyIndex: 1,
          suggestions: ["Tell me more"],
          files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
        },
      ]),
    ).toMatchObject([
      {
        kind: "message",
        role: "assistant",
        text: "<p>Answer</p>",
        historyIndex: 1,
        suggestions: ["Tell me more"],
        files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
      },
    ]);
  });

  it("updates assistant messages without touching other timeline entries", () => {
    const items = updateAssistantMessage(
      [assistantItem, proposalItem],
      assistantItem.id,
      {
        text: "Updated answer",
        suggestions: ["Next"],
        files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
      },
    );

    expect(items[0]).toMatchObject({ text: "Updated answer" });
    expect(items[0]).toMatchObject({ suggestions: ["Next"] });
    expect(items[0]).toMatchObject({
      files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
    });
    expect(items[1]).toBe(proposalItem);
  });

  it("appends a streamed assistant message with the reserved update ID", () => {
    const id = "streamed-assistant";
    const appended = appendTimelineItem(
      [],
      {
        kind: "message",
        role: "assistant",
        text: "",
        historyIndex: 1,
      },
      id,
    );
    const updated = updateAssistantMessage(appended, id, {
      text: "The response is visible.",
      html: "<p>The response is visible.</p>",
    });

    expect(updated[0]).toMatchObject({
      id,
      text: "The response is visible.",
      html: "<p>The response is visible.</p>",
    });
  });

  it("updates write proposal status from the result", () => {
    expect(
      updateWriteProposal(
        [proposalItem],
        "write-1",
        "Wrote src/example.ts.",
      )[0],
    ).toMatchObject({ status: "Applied" });
  });

  it("appends command output and marks command completion", () => {
    const withOutput = appendCommandOutput([commandItem], "run-1", "passed");
    expect(withOutput[0]).toMatchObject({ output: "passed" });
    expect(
      completeCommandProposal(withOutput, "run-1", "done")[0],
    ).toMatchObject({ output: "passed", status: "Completed" });
  });

  it("creates command proposal timeline entries", () => {
    expect(
      appendCommandProposal([], "run-1", "npm test", true)[0],
    ).toMatchObject({
      kind: "commandProposal",
      commandId: "run-1",
      command: "npm test",
      autoApproved: true,
      output: "",
      status: "Running command...",
    });
  });
});
