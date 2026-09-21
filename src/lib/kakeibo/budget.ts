import {
  BASE_RATIOS,
  CATEGORIES,
  CATEGORY_BY_CODE,
  CATEGORY_CODES,
  NEED_CODES,
  WANT_CODES,
  WANT_CODES_REVERSE,
  NEED_CODES_REVERSE,
  householdTypeFromSize,
} from "./categories.ts";
import type {
  BudgetLine,
  BudgetResult,
  CategoryCode,
  HousingType,
  HouseholdType,
} from "./types.ts";

export type ComputeBudgetInput = {
  netIncome: number;
  householdSize: number;
  housingType: HousingType;
  hasCar: boolean;
  housingActual: number;
  insuranceActual: number;
};

function copyRatios(type: HouseholdType): Record<CategoryCode, number> {
  return { ...BASE_RATIOS[type] };
}

function sumRatios(R: Record<CategoryCode, number>): number {
  return CATEGORY_CODES.reduce((s, c) => s + R[c], 0);
}

function restoreSavingsFloor(R: Record<CategoryCode, number>): void {
  const donors = [...WANT_CODES_REVERSE, ...NEED_CODES_REVERSE];
  while (R.savings < 10) {
    const donor = donors.find((c) => R[c] > 0);
    if (!donor) break;
    R[donor] -= 1;
    R.savings += 1;
  }
}

function applyAdjustments(
  R: Record<CategoryCode, number>,
  housingType: HousingType,
  hasCar: boolean,
): void {
  if (housingType === "own") {
    const cut = Math.min(3, R.housing);
    R.housing -= cut;
    R.savings += cut;
  }
  if (!hasCar) {
    const cut = Math.min(2, R.transport);
    R.transport -= cut;
    R.savings += cut;
  }
  restoreSavingsFloor(R);
  const total = sumRatios(R);
  if (total !== 100) {
    throw new Error(`Adjusted ratios must sum to 100, got ${total}`);
  }
}

function allocateProportional(
  amounts: Record<CategoryCode, number>,
  pool: CategoryCode[],
  take: number,
  floorOf: (code: CategoryCode) => number,
): number {
  const available: Partial<Record<CategoryCode, number>> = {};
  let poolSum = 0;
  for (const c of pool) {
    const cap = Math.max(0, amounts[c] - floorOf(c));
    available[c] = cap;
    poolSum += cap;
  }
  if (poolSum <= 0 || take <= 0) return take;
  const actualTake = Math.min(take, poolSum);

  const reductions: Partial<Record<CategoryCode, number>> = {};
  let allocated = 0;
  for (const c of pool) {
    const cap = available[c] ?? 0;
    const r = cap === 0 ? 0 : Math.floor((actualTake * amounts[c]) / poolSum);
    const clamped = Math.min(r, cap);
    reductions[c] = clamped;
    allocated += clamped;
  }

  let remainder = actualTake - allocated;
  const order = pool.slice().sort((a, b) => {
    if (amounts[b] !== amounts[a]) return amounts[b] - amounts[a];
    return CATEGORY_BY_CODE[a].sortOrder - CATEGORY_BY_CODE[b].sortOrder;
  });
  let guard = 0;
  while (remainder > 0 && guard < order.length * 4) {
    const c = order[guard % order.length];
    const cap = available[c] ?? 0;
    const used = reductions[c] ?? 0;
    if (used < cap) {
      reductions[c] = used + 1;
      remainder -= 1;
    }
    guard += 1;
  }

  for (const c of pool) {
    amounts[c] -= reductions[c] ?? 0;
  }
  return take - actualTake;
}

/**
 * Chapter 7 budget engine. Steps are fixed — do not reorder.
 * All amounts are integer minor units (JPY yen / MYR sen).
 */
export function computeBudget(input: ComputeBudgetInput): BudgetResult {
  const I = Math.trunc(input.netIncome);
  const A_h = Math.max(0, Math.trunc(input.housingActual));
  const A_i = Math.max(0, Math.trunc(input.insuranceActual));
  const householdType = householdTypeFromSize(input.householdSize);

  // Step 2–3: copy + adjust ratios
  const R = copyRatios(householdType);
  applyAdjustments(R, input.housingType, input.hasCar);

  // Step 4: provisional budgets, remainder to savings
  const T: Record<CategoryCode, number> = {} as Record<CategoryCode, number>;
  let sumT = 0;
  for (const c of CATEGORY_CODES) {
    T[c] = Math.floor((I * R[c]) / 100);
    sumT += T[c];
  }
  T.savings += I - sumT;

  // Step 5: mandatory actual override
  const B: Record<CategoryCode, number> = { ...T };
  B.housing = A_h;
  B.insurance = A_i;
  const overflowRaw = A_h - T.housing + (A_i - T.insurance);
  let overflow = Math.max(0, overflowRaw);
  const overflowApplied = overflow;

  const S_MIN = Math.floor((I * 10) / 100);

  // Step 6: compress wants → needs → savings (floor 10%)
  let shortage = 0;
  if (overflow > 0) {
    overflow = allocateProportional(B, WANT_CODES, overflow, () => 0);
    if (overflow > 0) {
      overflow = allocateProportional(B, NEED_CODES, overflow, () => 0);
    }
    if (overflow > 0) {
      overflow = allocateProportional(B, ["savings"], overflow, () => S_MIN);
    }
    shortage = overflow;
  }

  // Step 7: absorb ΣB vs I into savings, then other — skip when short
  if (shortage === 0) {
    const sumB = CATEGORY_CODES.reduce((s, c) => s + B[c], 0);
    let diff = I - sumB;
    if (diff !== 0) {
      const nextSavings = B.savings + diff;
      if (nextSavings >= 0) {
        B.savings = nextSavings;
      } else {
        diff = nextSavings;
        B.savings = 0;
        B.other += diff;
      }
    }
  }

  const lines: BudgetLine[] = CATEGORIES.map((cat) => ({
    categoryCode: cat.code,
    ratioPct: R[cat.code],
    budgetAmount: B[cat.code],
    compressed: B[cat.code] < T[cat.code] && cat.role !== "mandatory",
    mandatoryOverride: cat.role === "mandatory",
  }));

  return {
    householdType,
    netIncome: I,
    shortage,
    overflowApplied,
    lines,
  };
}

export function lineMap(result: BudgetResult): Record<CategoryCode, BudgetLine> {
  return Object.fromEntries(result.lines.map((l) => [l.categoryCode, l])) as Record<
    CategoryCode,
    BudgetLine
  >;
}
