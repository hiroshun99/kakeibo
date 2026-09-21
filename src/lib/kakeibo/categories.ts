import type { CategoryCode, CategoryRole, HouseholdType } from "./types.ts";

export type CategoryDef = {
  code: CategoryCode;
  ja: string;
  en: string;
  role: CategoryRole;
  sortOrder: number;
};

export const CATEGORIES: CategoryDef[] = [
  { code: "housing", ja: "住居", en: "Housing", role: "mandatory", sortOrder: 1 },
  { code: "insurance", ja: "保険", en: "Insurance", role: "mandatory", sortOrder: 2 },
  { code: "food", ja: "食費", en: "Food", role: "need", sortOrder: 3 },
  { code: "utilities", ja: "水道光熱", en: "Utilities", role: "need", sortOrder: 4 },
  { code: "telecom", ja: "通信", en: "Telecom", role: "need", sortOrder: 5 },
  { code: "transport", ja: "交通", en: "Transport", role: "need", sortOrder: 6 },
  { code: "daily", ja: "日用品", en: "Daily goods", role: "need", sortOrder: 7 },
  { code: "medical", ja: "医療", en: "Medical", role: "need", sortOrder: 8 },
  { code: "dining_leisure", ja: "外食・レジャー", en: "Dining / Leisure", role: "want", sortOrder: 9 },
  { code: "fashion_beauty", ja: "被服・美容", en: "Fashion / Beauty", role: "want", sortOrder: 10 },
  { code: "social", ja: "交際", en: "Social", role: "want", sortOrder: 11 },
  { code: "hobby_allowance", ja: "趣味・小遣い", en: "Hobby / Allowance", role: "want", sortOrder: 12 },
  { code: "other", ja: "その他", en: "Other", role: "want", sortOrder: 13 },
  { code: "savings", ja: "貯蓄", en: "Savings", role: "savings", sortOrder: 14 },
];

export const CATEGORY_BY_CODE: Record<CategoryCode, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c]),
) as Record<CategoryCode, CategoryDef>;

export const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

/** Want codes in reverse sort order (other → hobby → social → fashion → dining). */
export const WANT_CODES_REVERSE: CategoryCode[] = CATEGORIES.filter((c) => c.role === "want")
  .slice()
  .sort((a, b) => b.sortOrder - a.sortOrder)
  .map((c) => c.code);

/** Need codes in reverse sort order. */
export const NEED_CODES_REVERSE: CategoryCode[] = CATEGORIES.filter((c) => c.role === "need")
  .slice()
  .sort((a, b) => b.sortOrder - a.sortOrder)
  .map((c) => c.code);

export const WANT_CODES: CategoryCode[] = CATEGORIES.filter((c) => c.role === "want").map(
  (c) => c.code,
);
export const NEED_CODES: CategoryCode[] = CATEGORIES.filter((c) => c.role === "need").map(
  (c) => c.code,
);

/** Base ratios before housing/car adjustments. Each column sums to 100. */
export const BASE_RATIOS: Record<HouseholdType, Record<CategoryCode, number>> = {
  single: {
    housing: 25,
    insurance: 3,
    food: 10,
    utilities: 3,
    telecom: 3,
    transport: 3,
    daily: 2,
    medical: 1,
    dining_leisure: 8,
    fashion_beauty: 5,
    social: 5,
    hobby_allowance: 10,
    other: 2,
    savings: 20,
  },
  couple: {
    housing: 20,
    insurance: 3,
    food: 15,
    utilities: 4,
    telecom: 3,
    transport: 3,
    daily: 2,
    medical: 1,
    dining_leisure: 7,
    fashion_beauty: 5,
    social: 4,
    hobby_allowance: 10,
    other: 4,
    savings: 19,
  },
  family3: {
    housing: 25,
    insurance: 3,
    food: 18,
    utilities: 5,
    telecom: 2,
    transport: 2,
    daily: 2,
    medical: 1,
    dining_leisure: 5,
    fashion_beauty: 3,
    social: 2,
    hobby_allowance: 8,
    other: 2,
    savings: 22,
  },
  family4: {
    housing: 20,
    insurance: 3,
    food: 20,
    utilities: 5,
    telecom: 2,
    transport: 3,
    daily: 2,
    medical: 2,
    dining_leisure: 4,
    fashion_beauty: 2,
    social: 2,
    hobby_allowance: 8,
    other: 4,
    savings: 23,
  },
};

export function householdTypeFromSize(size: number): HouseholdType {
  if (size >= 4) return "family4";
  if (size === 3) return "family3";
  if (size === 2) return "couple";
  return "single";
}

export function categoryLabel(code: CategoryCode, locale: "ja" | "en"): string {
  const def = CATEGORY_BY_CODE[code];
  return locale === "ja" ? def.ja : def.en;
}
