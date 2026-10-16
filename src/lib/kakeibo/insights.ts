import { CATEGORY_CODES } from "./categories.ts";
import { addMonthsClamped } from "./periods.ts";
import type { CategoryCode, Currency } from "./types.ts";

/** Spending that is not a transfer into savings. */
export function livingSpend(byCategory: Record<string, number>): number {
  let total = 0;
  for (const [code, amount] of Object.entries(byCategory)) {
    if (code === "savings") continue;
    total += amount;
  }
  return total;
}

/** Whole-percent change. Null when the baseline is 0 and the current amount is not. */
export function percentChange(current: number, baseline: number): number | null {
  if (baseline <= 0) return current === 0 ? 0 : null;
  return Math.round(((current - baseline) / baseline) * 100);
}

export type SavingsForecast = {
  goal: number;
  saved: number;
  monthlyPace: number;
  remaining: number;
  monthsLeft: number | null;
  etaYmd: string | null;
  achieved: boolean;
};

/**
 * When the savings goal is reached if the recent monthly pace continues.
 * Pace of 0 leaves the date unknown. Already there when saved covers the goal.
 */
export function forecastSavings(input: {
  goal: number;
  saved: number;
  monthlyPace: number;
  today: string;
}): SavingsForecast {
  const goal = Math.max(0, Math.trunc(input.goal));
  const saved = Math.max(0, Math.trunc(input.saved));
  const monthlyPace = Math.max(0, Math.trunc(input.monthlyPace));
  const remaining = Math.max(0, goal - saved);
  if (remaining === 0) {
    return {
      goal,
      saved,
      monthlyPace,
      remaining,
      monthsLeft: 0,
      etaYmd: input.today,
      achieved: true,
    };
  }
  if (monthlyPace <= 0) {
    return {
      goal,
      saved,
      monthlyPace,
      remaining,
      monthsLeft: null,
      etaYmd: null,
      achieved: false,
    };
  }
  const monthsLeft = Math.ceil(remaining / monthlyPace);
  return {
    goal,
    saved,
    monthlyPace,
    remaining,
    monthsLeft,
    etaYmd: addMonthsClamped(input.today, monthsLeft),
    achieved: false,
  };
}

/** Average of prior periods, or the planned amount when that average is 0 or missing. */
export function savingsPace(priorPeriodSavings: number[], planned: number): number {
  const plan = Math.max(0, Math.trunc(planned));
  if (priorPeriodSavings.length === 0) return plan;
  const avg = Math.round(
    priorPeriodSavings.reduce((sum, amount) => sum + Math.max(0, amount), 0) / priorPeriodSavings.length,
  );
  return avg > 0 ? avg : plan;
}

const QUICK_PRESETS: Record<Currency, number[]> = {
  JPY: [500, 1_000, 3_000, 5_000],
  MYR: [500, 1_000, 2_000, 5_000],
};

/** Last amount first, then common presets, at most four. */
export function quickAmounts(currency: Currency, lastAmount: number): number[] {
  const out: number[] = [];
  const last = Math.trunc(lastAmount);
  if (last > 0) out.push(last);
  for (const preset of QUICK_PRESETS[currency]) {
    if (out.length >= 4) break;
    if (!out.includes(preset)) out.push(preset);
  }
  return out;
}

export function buildCategoryTrends(
  periods: { byCategory: Record<string, number> }[],
): { categoryCode: CategoryCode; points: number[] }[] {
  return CATEGORY_CODES.filter((code) => code !== "savings")
    .map((categoryCode) => ({
      categoryCode,
      points: periods.map((period) => period.byCategory[categoryCode] ?? 0),
    }))
    .filter((row) => row.points.some((amount) => amount > 0))
    .sort(
      (a, b) =>
        (b.points[b.points.length - 1] ?? 0) - (a.points[a.points.length - 1] ?? 0),
    );
}
