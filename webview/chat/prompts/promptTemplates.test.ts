import { describe, expect, it } from "vitest";
import { insertPromptTemplate } from "./promptTemplates";

describe("insertPromptTemplate", () => {
  it("inserts the template into an empty draft", () => {
    expect(insertPromptTemplate("", "Explain this code.")).toBe(
      "Explain this code.",
    );
  });

  it("preserves existing draft text and separates the template", () => {
    expect(insertPromptTemplate("Check this function  ", "Write tests.")).toBe(
      "Check this function\n\nWrite tests.",
    );
  });

  it("replaces whitespace-only drafts with the template", () => {
    expect(insertPromptTemplate(" \n ", "Explain this code.")).toBe(
      "Explain this code.",
    );
  });
});
