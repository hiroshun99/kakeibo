import type { CategoryCode } from "./types.ts";

/** Housing and insurance are actual bills. Savings already receives the surplus. */
const SKIP = new Set<CategoryCode>(["housing", "insurance", "savings"]);

export function categoryCarry(
  lines: { categoryCode: CategoryCode; budgetAmount: number }[],
  spent: Record<string, number>,
  enabled: boolean,
): Partial<Record<CategoryCode, number>> {
  if (!enabled) return {};
  const carry: Partial<Record<CategoryCode, number>> = {};
  for (const line of lines) {
    if (SKIP.has(line.categoryCode)) continue;
    const left = line.budgetAmount - (spent[line.categoryCode] ?? 0);
    if (left !== 0) carry[line.categoryCode] = left;
  }
  return carry;
}