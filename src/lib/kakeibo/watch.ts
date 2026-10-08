import type { CategoryCode } from "./types.ts";

export type WatchCharge = {
  ymd: string;
  amount: number;
  category: CategoryCode;
  label: string;
  recurring: boolean;
};

export type WatchHit = {
  key: string;
  label: string;
  categoryCode: CategoryCode;
  previous: number;
  latest: number;
  months: number;
};

const PROTECTED = new Set<CategoryCode>(["housing", "insurance", "savings"]);

export function merchantKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Same store or subscription name across months.
 * A hike is any increase versus the previous month.
 * A cancel candidate is a charge that has kept coming for 3+ months
 * and looks like a subscription (marked recurring, flat amount, or telecom).
 */
export function detectWatch(
  charges: WatchCharge[],
  dismissed: { key: string; kind: "hike" | "cancel" }[],
): { hikes: WatchHit[]; cancels: WatchHit[] } {
  const skip = new Set(dismissed.map((d) => `${d.kind}:${d.key}`));
  const groups = new Map<string, WatchCharge[]>();
  for (const charge of charges) {
    const key = merchantKey(charge.label);
    if (key.length < 2) continue;
    const list = groups.get(key) ?? [];
    list.push(charge);
    groups.set(key, list);
  }

  const hikes: WatchHit[] = [];
  const cancels: WatchHit[] = [];

  for (const [key, list] of groups) {
    const byMonth = new Map<string, { amount: number; category: CategoryCode; recurring: boolean }>();
    for (const charge of list) {
      const month = charge.ymd.slice(0, 7);
      const bucket = byMonth.get(month) ?? {
        amount: 0,
        category: charge.category,
        recurring: false,
      };
      bucket.amount += charge.amount;
      bucket.recurring = bucket.recurring || charge.recurring;
      bucket.category = charge.category;
      byMonth.set(month, bucket);
    }
    const months = [...byMonth.keys()].sort();
    if (months.length < 2) continue;
    const latestMonth = months[months.length - 1]!;
    const prevMonth = months[months.length - 2]!;
    const latest = byMonth.get(latestMonth)!;
    const previous = byMonth.get(prevMonth)!;
    const label = list.find((c) => merchantKey(c.label) === key)?.label.trim() || key;
    const hit: WatchHit = {
      key,
      label,
      categoryCode: latest.category,
      previous: previous.amount,
      latest: latest.amount,
      months: months.length,
    };
    if (latest.amount > previous.amount && !skip.has(`hike:${key}`)) hikes.push(hit);

    if (months.length < 3 || PROTECTED.has(latest.category) || skip.has(`cancel:${key}`)) continue;
    const amounts = months.slice(-3).map((m) => byMonth.get(m)!.amount);
    const flat = amounts.every((n) => n === amounts[0]);
    const marked = [...byMonth.values()].some((b) => b.recurring);
    if (marked || flat || latest.category === "telecom") cancels.push(hit);
  }

  hikes.sort((a, b) => b.latest - b.previous - (a.latest - a.previous));
  cancels.sort((a, b) => b.months - a.months || b.latest - a.latest);
  return { hikes: hikes.slice(0, 4), cancels: cancels.slice(0, 4) };
}
