export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const CURRENCIES = ["JPY", "MYR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const HOUSING_TYPES = ["rent", "own"] as const;
export type HousingType = (typeof HOUSING_TYPES)[number];

export const HOUSEHOLD_TYPES = ["single", "couple", "family3", "family4"] as const;
export type HouseholdType = (typeof HOUSEHOLD_TYPES)[number];

export const CATEGORY_ROLES = ["mandatory", "need", "want", "savings"] as const;
export type CategoryRole = (typeof CATEGORY_ROLES)[number];

export type CategoryCode =
  | "housing"
  | "insurance"
  | "food"
  | "utilities"
  | "telecom"
  | "transport"
  | "daily"
  | "medical"
  | "dining_leisure"
  | "fashion_beauty"
  | "social"
  | "hobby_allowance"
  | "other"
  | "savings";

export type ProfileInput = {
  locale: Locale;
  currency: Currency;
  netIncome: number;
  householdSize: number;
  housingType: HousingType;
  hasCar: boolean;
  housingActual: number;
  insuranceActual: number;
};

export type BudgetLine = {
  categoryCode: CategoryCode;
  ratioPct: number;
  budgetAmount: number;
  compressed: boolean;
  mandatoryOverride: boolean;
};

export type BudgetResult = {
  householdType: HouseholdType;
  netIncome: number;
  shortage: number;
  overflowApplied: number;
  lines: BudgetLine[];
};
