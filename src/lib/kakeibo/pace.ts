import type { CategoryCode } from "./types.ts";
import { CATEGORY_CODES } from "./categories.ts";
import {
  addDays,
  addMonthsClamped,
  clampPayday,
  daysInclusive,
  formatYmd,
  parseYmd,
} from "./periods.ts";
import { daysInMonth } from "./dates.ts";

export type Season = "spring" | "summer" | "autumn" | "winter";

const RESERVED = new Set<string>(["housing", "insurance", "savings"]);

export function seasonOfMonth(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/** Next payday on or after tomorrow. Payday itself is the day money arrives. */
export function nextPaydayYmd(today: string, payday: number): string {
  const day = clampPayday(payday);
  const { year, month } = parseYmd(today);
  const thisPay = formatYmd(year, month, Math.min(day, daysInMonth(year, month)));
  if (today < thisPay) return thisPay;
  return addMonthsClamped(thisPay, 1);
}

export function shortDate(ymd: string, locale: "ja" | "en"): string {
  const { month, day } = parseYmd(ymd);
  if (locale === "ja") return `${month}月${day}日`;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[month - 1]} ${day}`;
}

export type CashPace = {
  todayAllowance: number;
  untilPayday: number;
  paydayDate: string;
  days: number;
  shortfallDate: string | null;
  alreadyShort: boolean;
};

/**
 * Free cash is what's left after unpaid rent, insurance, and the savings goal.
 * Until payday is that cash, scaled so a calendar month isn't all spent before payday.
 * Today is that amount divided by the days left until payday (or the period end).
 */
export function cashPace(input: {
  today: string;
  periodEnd: string;
  payday: number;
  dayIndex: number;
  netIncome: number;
  extraIncome: number;
  totalSpent: number;
  categories: { code: string; budget: number; spent: number }[];
}): CashPace {
  const paydayDate = nextPaydayYmd(input.today, input.payday);
  const eve = addDays(paydayDate, -1);
  const periodEnd = input.periodEnd < input.today ? input.today : input.periodEnd;
  const horizon = eve < periodEnd ? eve : periodEnd;
  const last = horizon < input.today ? input.today : horizon;
  const days = Math.max(1, daysInclusive(input.today, last));
  const periodDaysLeft = Math.max(1, daysInclusive(input.today, periodEnd));

  let reserved = 0;
  let variableSpent = 0;
  for (const category of input.categories) {
    if (RESERVED.has(category.code)) {
      reserved += Math.max(0, category.budget - category.spent);
    } else {
      variableSpent += Math.max(0, category.spent);
    }
  }
  const freeCash = input.netIncome + input.extraIncome - input.totalSpent - reserved;
  const share = Math.min(1, days / periodDaysLeft);
  const untilPayday = Math.max(0, Math.floor(Math.max(0, freeCash) * share));
  const todayAllowance = Math.floor(untilPayday / days);

  if (freeCash <= 0) {
    return {
      todayAllowance: 0,
      untilPayday: 0,
      paydayDate,
      days,
      shortfallDate: null,
      alreadyShort: true,
    };
  }

  let shortfallDate: string | null = null;
  if (variableSpent > 0 && input.dayIndex > 0) {
    const daily = variableSpent / input.dayIndex;
    const daysLeft = Math.floor(freeCash / daily);
    const date = addDays(input.today, daysLeft);
    if (date <= input.periodEnd) shortfallDate = date;
  }

  return {
    todayAllowance,
    untilPayday,
    paydayDate,
    days,
    shortfallDate,
    alreadyShort: false,
  };
}

export type BudgetSuggestion = {
  categoryCode: CategoryCode;
  current: number;
  recommended: number;
  locked: boolean;
};

/**
 * Fit past spending into this period's income.
 * Savings, rent, and insurance stay put — savings is never reduced to fund the rest.
 */
export function recommendFromHistory(input: {
  netIncome: number;
  lines: { categoryCode: CategoryCode; budgetAmount: number }[];
  periods: Record<string, number>[];
}): BudgetSuggestion[] | null {
  if (input.periods.length === 0) return null;
  const current = new Map(input.lines.map((line) => [line.categoryCode, line.budgetAmount]));
  const locked = new Set<CategoryCode>(["housing", "insurance", "savings"]);
  const lockedSum = CATEGORY_CODES.filter((code) => locked.has(code)).reduce(
    (sum, code) => sum + (current.get(code) ?? 0),
    0,
  );
  const pool = Math.max(0, input.netIncome - lockedSum);
  const variable = CATEGORY_CODES.filter((code) => !locked.has(code));
  const raw = variable.map((code) => {
    const total = input.periods.reduce((sum, period) => sum + (period[code] ?? 0), 0);
    return Math.round(total / input.periods.length);
  });
  const rawSum = raw.reduce((sum, amount) => sum + amount, 0);
  let recommended: number[];
  if (rawSum <= 0) {
    const bases = variable.map((code) => current.get(code) ?? 0);
    recommended = scaleToPool(bases, pool);
  } else {
    recommended = scaleToPool(raw, pool);
  }
  return CATEGORY_CODES.map((code) => {
    if (locked.has(code)) {
      const amount = current.get(code) ?? 0;
      return { categoryCode: code, current: amount, recommended: amount, locked: true };
    }
    const index = variable.indexOf(code);
    return {
      categoryCode: code,
      current: current.get(code) ?? 0,
      recommended: recommended[index] ?? 0,
      locked: false,
    };
  });
}

function scaleToPool(raw: number[], pool: number): number[] {
  if (raw.length === 0) return [];
  if (pool <= 0) return raw.map(() => 0);
  const sum = raw.reduce((total, amount) => total + amount, 0);
  if (sum <= 0) {
    const base = Math.floor(pool / raw.length);
    const out = raw.map(() => base);
    out[0] = (out[0] ?? 0) + (pool - base * raw.length);
    return out;
  }
  const out = raw.map((amount) => Math.floor((amount * pool) / sum));
  let remainder = pool - out.reduce((total, amount) => total + amount, 0);
  let index = 0;
  raw.forEach((amount, i) => {
    if (amount > (raw[index] ?? 0)) index = i;
  });
  out[index] = (out[index] ?? 0) + remainder;
  return out;
}
