import { describe, expect, it } from "vitest";
import type { TimelineItem } from "./types";
import {
  appendCommandOutput,
  appendCommandProposal,
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
        },
      ]),
    ).toMatchObject([
      {
        kind: "message",
        role: "assistant",
        text: "<p>Answer</p>",
        historyIndex: 1,
        suggestions: ["Tell me more"],
      },
    ]);
  });

  it("updates assistant messages without touching other timeline entries", () => {
    const items = updateAssistantMessage(
      [assistantItem, proposalItem],
      assistantItem.id,
      { suggestions: ["Next"] },
    );

    expect(items[0]).toMatchObject({ suggestions: ["Next"] });
    expect(items[1]).toBe(proposalItem);
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
