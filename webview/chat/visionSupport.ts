import type { ProviderModel } from "./types";

export type VisionSupport = "supported" | "unsupported" | "unknown" | "none";

/** "none" means no model is selected or it is not in the model list. */
export function getVisionSupport(
  models: ProviderModel[],
  selectedModel: string,
): VisionSupport {
  const model = models.find(({ model }) => model === selectedModel);
  if (!model) return "none";
  if (model.capabilities?.includes("vision")) return "supported";
  return model.capabilitiesUnknown ? "unknown" : "unsupported";
}

export const VISION_LABELS: Record<
  Exclude<VisionSupport, "none">,
  { label: string; title: string }
> = {
  supported: {
    label: "Vision",
    title: "This model can read images",
  },
  unsupported: {
    label: "No vision",
    title: "This model cannot read images. Choose a vision-capable model to use screenshots.",
  },
  unknown: {
    label: "Vision unknown",
    title: "The provider does not report whether this model can read images",
  },
};
