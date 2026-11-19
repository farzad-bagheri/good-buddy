import { describe, expect, it } from "vitest";
import { getSlashCommands, getSlashQuery } from "./slashCommands";

describe("slash commands", () => {
  it("detects and filters a command at the cursor without treating paths as commands", () => {
    expect(getSlashQuery("hello /attach rest", 13)).toEqual({ start: 6, end: 13, query: "attach" });
    expect(getSlashQuery("src/file", 8)).toBeUndefined();
    expect(getSlashCommands([], "attach").map((command) => command.id)).toEqual([
      "attach-files", "attach-selection", "attach-terminal", "attach-problems",
    ]);
  });

  it("includes prompts, actions, and separately identified workspace skills", () => {
    const commands = getSlashCommands([{
      id: "file:///workspace/.github/skills/tests/SKILL.md",
      name: "write-tests",
      description: "Test a project",
      location: "workspace: .github/skills/tests/SKILL.md",
    }], "test");
    expect(commands.map((command) => command.kind)).toEqual(["prompt", "skill"]);
    expect(getSlashCommands([], "review")[0].id).toBe("review-changes");
  });

  it("uses the available prompt and action icons without requiring skill icons", () => {
    expect(getSlashCommands([], "tests")[0].icon).toBe("tests-icon");
    expect(getSlashCommands([], "debug")[0].icon).toBe("debug-icon");
    expect(getSlashCommands([], "attach-selection")[0].icon).toBe("selection-icon");
    expect(getSlashCommands([], "review")[0].icon).toBe("git-icon");
  });
});
