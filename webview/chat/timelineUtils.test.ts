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
  existed: false,
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
          extras: {
            suggestions: ["Tell me more"],
            files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
            artifacts: [
              {
                type: "code",
                title: "Example component",
                language: "tsx",
                content: "export function App() {}",
              },
            ],
          },
        },
      ]),
    ).toMatchObject([
      {
        kind: "message",
        role: "assistant",
        text: "<p>Answer</p>",
        historyIndex: 1,
        extras: {
          suggestions: ["Tell me more"],
          files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
          artifacts: [
            {
              type: "code",
              title: "Example component",
              language: "tsx",
              content: "export function App() {}",
            },
          ],
        },
      },
    ]);
  });

  it("updates assistant messages without touching other timeline entries", () => {
    const items = updateAssistantMessage(
      [assistantItem, proposalItem],
      assistantItem.id,
      {
        text: "Updated answer",
        extras: {
          suggestions: ["Next"],
          files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
          artifacts: [
            {
              type: "code",
              title: "Example component",
              language: "tsx",
              content: "export function App() {}",
            },
          ],
        },
      },
    );

    expect(items[0]).toMatchObject({ text: "Updated answer" });
    expect(items[0]).toMatchObject({
      extras: {
        suggestions: ["Next"],
        files: [{ name: "App.tsx", path: "webview/chat/App.tsx" }],
        artifacts: [
          {
            title: "Example component",
            language: "tsx",
            content: "export function App() {}",
          },
        ],
      },
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

  it("renders structured command results without exposing their JSON envelope", () => {
    const result = JSON.stringify({
      status: "failed",
      command: "python missing.py",
      cwd: "D:/workspace",
      exitCode: 1,
      output: "python: can't open file 'missing.py'",
    });

    expect(completeCommandProposal([commandItem], "run-1", result)[0]).toMatchObject({
      output: "python: can't open file 'missing.py'",
      status: "Command failed",
    });
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

  it("updates a proposed command when it starts instead of duplicating it", () => {
    const proposed = appendCommandProposal([], "run-1", "pnpm test", false);
    const started = appendCommandProposal(proposed, "run-1", "pnpm test", true);

    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      kind: "commandProposal",
      commandId: "run-1",
      autoApproved: true,
      status: "Running command...",
    });
  });
});
