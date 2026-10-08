import type { CategoryCode } from "./types.ts";

export const SPLIT_PRESET_IDS = ["supermarket", "convenience", "drugstore"] as const;
export type SplitPresetId = (typeof SPLIT_PRESET_IDS)[number];

export const SPLIT_PRESETS: Record<SplitPresetId, CategoryCode[]> = {
  supermarket: ["food", "daily", "dining_leisure"],
  convenience: ["food", "daily", "dining_leisure"],
  drugstore: ["daily", "medical", "food", "fashion_beauty"],
};

export function presetCategories(id: SplitPresetId): CategoryCode[] {
  return SPLIT_PRESETS[id];
}
