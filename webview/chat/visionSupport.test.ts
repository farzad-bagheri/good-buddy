import { describe, expect, it } from "vitest";
import type { ProviderModel } from "./types";
import { getVisionSupport } from "./visionSupport";

const model = (
  name: string,
  overrides: Partial<ProviderModel> = {},
): ProviderModel => ({
  caption: name,
  name,
  model: name,
  details: {
    format: "",
    family: "",
    parameter_size: "",
    quantization_level: "",
    context_length: 0,
    embedding_length: 0,
  },
  capabilities: ["completion"],
  ...overrides,
});

describe("getVisionSupport", () => {
  const models = [
    model("vl", { capabilities: ["completion", "vision"] }),
    model("text"),
    model("mystery", { capabilities: [], capabilitiesUnknown: true }),
  ];

  it("reports each support state", () => {
    expect(getVisionSupport(models, "vl")).toBe("supported");
    expect(getVisionSupport(models, "text")).toBe("unsupported");
    expect(getVisionSupport(models, "mystery")).toBe("unknown");
  });

  it("returns none when the model is missing", () => {
    expect(getVisionSupport(models, "")).toBe("none");
    expect(getVisionSupport(models, "gone")).toBe("none");
  });
});
