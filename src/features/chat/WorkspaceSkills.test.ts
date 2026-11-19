import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  trusted: true,
  files: new Map<string, string>(),
  symlinks: new Set<string>(),
  warnings: [] as string[],
}));

vi.mock("vscode", () => {
  const uri = (path: string) => ({ path, toString: () => path });
  const root = uri("/workspace");
  return {
    FileType: { SymbolicLink: 64 },
    Uri: { joinPath: (base: { path: string }, ...parts: string[]) => uri([base.path, ...parts].join("/")) },
    RelativePattern: class {
      constructor(readonly folder: unknown, readonly pattern: string) {}
    },
    workspace: {
      get isTrusted() { return state.trusted; },
      workspaceFolders: [{ uri: root, name: "project" }],
      getWorkspaceFolder: (file: { path: string }) =>
        file.path.startsWith("/workspace/") ? { uri: root, name: "project" } : undefined,
      asRelativePath: (file: { path: string }) => file.path.slice("/workspace/".length),
      findFiles: async (pattern: { pattern: string }) =>
        [...state.files.keys()]
          .filter((name) => name.startsWith(`/workspace/${pattern.pattern.split("*")[0]}`))
          .map(uri),
      fs: {
        stat: async (file: { path: string }) => ({
          type: state.symlinks.has(file.path) ? 64 : 1,
          size: Buffer.byteLength(state.files.get(file.path) ?? ""),
        }),
        readFile: async (file: { path: string }) => {
          const value = state.files.get(file.path);
          if (value === undefined) throw new Error("File not found");
          return Buffer.from(value);
        },
      },
    },
    window: { showWarningMessage: (message: string) => { state.warnings.push(message); } },
  };
});

import { parseSkill, WorkspaceSkills } from "./WorkspaceSkills";

const path = "/workspace/.github/skills/tests/SKILL.md";
const skill = "---\nname: write-tests\ndescription: Write focused tests\n---\nInspect the project first.";

beforeEach(() => {
  state.trusted = true;
  state.files.clear();
  state.symlinks.clear();
  state.warnings = [];
});

describe("workspace skills", () => {
  it("discovers skills and reloads the explicitly selected instructions", async () => {
    state.files.set(path, skill);
    state.files.set("/workspace/.agents/skills/review/SKILL.md", skill.replace("write-tests", "review"));
    const service = new WorkspaceSkills({ appendLine: vi.fn() });
    const skills = await service.list();
    expect(skills.map((item) => item.name)).toEqual(["review", "write-tests"]);
    state.files.set(path, skill.replace("Inspect the project first.", "Run focused tests."));
    expect(await service.load(path)).toEqual({ name: "write-tests", description: "Write focused tests", instructions: "Run focused tests." });
    await expect(service.load("/workspace/other")).rejects.toThrow("no longer available");
  });

  it("requires trust and rejects symlinks and oversized files", async () => {
    state.files.set(path, skill);
    const service = new WorkspaceSkills({ appendLine: vi.fn() });
    await service.list();
    state.trusted = false;
    await expect(service.load(path)).rejects.toThrow("Workspace trust");
    expect(await service.list()).toEqual([]);
    state.trusted = true;
    state.symlinks.add("/workspace/.github/skills/tests");
    expect(await service.list()).toEqual([]);
    expect(state.warnings.at(-1)).toContain("Symbolic links");
    state.symlinks.clear();
    state.files.set(path, skill + "x".repeat(65_536));
    expect(await service.list()).toEqual([]);
    expect(state.warnings.at(-1)).toContain("64 KB");
  });

  it("rejects malformed or incomplete skills", () => {
    expect(() => parseSkill("No frontmatter")).toThrow("frontmatter");
    expect(() => parseSkill(skill.replace("write-tests", "Write Tests"))).toThrow("kebab-case");
    expect(() => parseSkill(skill.replace("Inspect the project first.", ""))).toThrow("instructions");
  });
});
