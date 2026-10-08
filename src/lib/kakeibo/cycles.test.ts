import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categoryCarry } from "./rollover.ts";
import {
  periodContaining,
  periodLabel,
  shiftPeriodId,
  weekBudget,
  weekWindow,
} from "./periods.ts";
import { detectWatch } from "./watch.ts";

describe("payday period", () => {
  it("uses the calendar month when the cycle is calendar", () => {
    const period = periodContaining("2026-10-08", "calendar", 25);
    assert.equal(period.id, "2026-10");
    assert.equal(period.start, "2026-10-01");
    assert.equal(period.end, "2026-10-31");
  });

  it("runs from payday to the day before the next payday", () => {
    const mid = periodContaining("2026-10-08", "payday", 25);
    assert.equal(mid.id, "2026-09-25");
    assert.equal(mid.end, "2026-10-24");
    const onPay = periodContaining("2026-10-25", "payday", 25);
    assert.equal(onPay.id, "2026-10-25");
    assert.equal(onPay.end, "2026-11-24");
  });

  it("shifts a payday window by one salary cycle", () => {
    assert.equal(shiftPeriodId("2026-09-25", 1), "2026-10-25");
    assert.equal(shiftPeriodId("2026-10", -1), "2026-09");
  });

  it("labels a payday window with both dates", () => {
    assert.match(periodLabel("2026-09-25", "ja"), /9\/25/);
    assert.match(periodLabel("2026-09-25", "ja"), /10\/24/);
  });
});

describe("weekly budget", () => {
  it("clips the week to the period and shares the spendable amount", () => {
    const week = weekWindow("2026-10-01", "2026-10-31", "2026-10-08");
    assert.ok(week);
    assert.equal(week.start, "2026-10-05");
    assert.equal(week.end, "2026-10-11");
    assert.equal(weekBudget(310_000, 31, week.days), Math.floor((310_000 * 7) / 31));
  });
});

describe("category rollover", () => {
  it("carries unused food and skips housing", () => {
    const carry = categoryCarry(
      [
        { categoryCode: "food", budgetAmount: 30_000 },
        { categoryCode: "housing", budgetAmount: 80_000 },
        { categoryCode: "daily", budgetAmount: 4_000 },
      ],
      { food: 20_000, housing: 80_000, daily: 5_000 },
      true,
    );
    assert.equal(carry.food, 10_000);
    assert.equal(carry.housing, undefined);
    assert.equal(carry.daily, undefined);
  });

  it("carries nothing when rollover is off", () => {
    const carry = categoryCarry(
      [{ categoryCode: "food", budgetAmount: 30_000 }],
      { food: 0 },
      false,
    );
    assert.deepEqual(carry, {});
  });
});

describe("price and cancel watch", () => {
  const netflix = (month: string, amount: number, recurring = true) => ({
    ymd: `${month}-05`,
    amount,
    category: "telecom" as const,
    label: "Netflix",
    recurring,
  });

  it("flags a price increase and a long flat subscription", () => {
    const result = detectWatch(
      [
        netflix("2026-07", 1490),
        netflix("2026-08", 1490),
        netflix("2026-09", 1790),
        { ymd: "2026-07-02", amount: 980, category: "hobby_allowance", label: "音楽", recurring: false },
        { ymd: "2026-08-02", amount: 980, category: "hobby_allowance", label: "音楽", recurring: false },
        { ymd: "2026-09-02", amount: 980, category: "hobby_allowance", label: "音楽", recurring: false },
      ],
      [],
    );
    assert.equal(result.hikes[0]?.label, "Netflix");
    assert.equal(result.hikes[0]?.previous, 1490);
    assert.equal(result.hikes[0]?.latest, 1790);
    assert.ok(result.cancels.some((c) => c.label === "音楽"));
  });

  it("hides a dismissed hike", () => {
    const result = detectWatch(
      [netflix("2026-08", 1000), netflix("2026-09", 1200)],
      [{ key: "netflix", kind: "hike" }],
    );
    assert.equal(result.hikes.length, 0);
  });

  it("does not suggest cancelling rent", () => {
    const result = detectWatch(
      [1, 2, 3].map((m) => ({
        ymd: `2026-0${m}-01`,
        amount: 80_000,
        category: "housing" as const,
        label: "家賃",
        recurring: true,
      })),
      [],
    );
    assert.equal(result.cancels.length, 0);
  });
});
