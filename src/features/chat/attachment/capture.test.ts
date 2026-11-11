import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  workspace: {
    asRelativePath: (uri: { path: string }) =>
      uri.path.replace(/^\/workspace\//, ""),
  },
  window: {},
  env: {},
  commands: {},
}));

import { cleanTerminalText, formatProblems, tailWithinBytes } from "./capture";

const diag = (severity: number, line: number, message: string, source = "ts") =>
  ({
    severity,
    message,
    source,
    code: 2322,
    range: { start: { line, character: 4 } },
  }) as never;

describe("terminal capture helpers", () => {
  it("normalizes line endings and trailing whitespace", () => {
    expect(cleanTerminalText("a  \r\nb\r\n\r\n")).toBe("a\nb");
  });

  it("keeps the end of long output and marks the truncation", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const result = tailWithinBytes(text, 120);
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(120);
    expect(result.startsWith("[...earlier output truncated...]")).toBe(true);
    expect(result.endsWith("line 99")).toBe(true);
  });

  it("leaves short output untouched", () => {
    expect(tailWithinBytes("short", 100)).toBe("short");
  });
});

describe("formatProblems", () => {
  it("lists errors before warnings and skips hints", () => {
    const uri = { path: "/workspace/src/a.ts" } as never;
    const { content, total } = formatProblems([
      [uri, [diag(1, 9, "unused"), diag(0, 1, "bad type"), diag(3, 0, "hint")]],
    ]);
    expect(total).toBe(2);
    expect(content.split("\n")).toEqual([
      "src/a.ts:2:5 error: bad type (ts 2322)",
      "src/a.ts:10:5 warning: unused (ts 2322)",
    ]);
  });

  it("reports how many problems did not fit", () => {
    const uri = { path: "/workspace/a.ts" } as never;
    const many = Array.from({ length: 5 }, (_, i) => diag(0, i, "boom"));
    const { content } = formatProblems([[uri, many]], 80);
    expect(content).toMatch(/\.\.\.and \d+ more not shown$/);
  });
});
