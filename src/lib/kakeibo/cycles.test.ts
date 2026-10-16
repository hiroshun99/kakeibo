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
import { detectSubscriptions, detectWatch } from "./watch.ts";
import { cashPace, recommendFromHistory, seasonOfMonth } from "./pace.ts";
import {
  buildCategoryTrends,
  forecastSavings,
  livingSpend,
  percentChange,
  quickAmounts,
  savingsPace,
} from "./insights.ts";

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
    assert.equal(carry.daily, -1_000);
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

describe("today and payday pace", () => {
  it("splits free cash across the days until payday", () => {
    const pace = cashPace({
      today: "2026-10-12",
      periodEnd: "2026-10-31",
      payday: 25,
      dayIndex: 12,
      netIncome: 300_000,
      extraIncome: 0,
      totalSpent: 90_000,
      categories: [
        { code: "housing", budget: 80_000, spent: 80_000 },
        { code: "savings", budget: 60_000, spent: 0 },
        { code: "food", budget: 30_000, spent: 10_000 },
      ],
    });
    assert.equal(pace.paydayDate, "2026-10-25");
    assert.equal(pace.days, 13);
    assert.equal(pace.untilPayday, 97_500);
    assert.equal(pace.todayAllowance, Math.floor(97_500 / 13));
    assert.equal(pace.shortfallDate, null);
    assert.equal(pace.alreadyShort, false);
  });

  it("names the day the balance runs out", () => {
    const pace = cashPace({
      today: "2026-10-12",
      periodEnd: "2026-10-31",
      payday: 25,
      dayIndex: 10,
      netIncome: 100_000,
      extraIncome: 0,
      totalSpent: 88_000,
      categories: [
        { code: "housing", budget: 0, spent: 0 },
        { code: "savings", budget: 0, spent: 0 },
        { code: "food", budget: 40_000, spent: 60_000 },
      ],
    });
    assert.equal(pace.alreadyShort, false);
    assert.equal(pace.shortfallDate, "2026-10-14");
  });

  it("says the balance is already short", () => {
    const pace = cashPace({
      today: "2026-10-12",
      periodEnd: "2026-10-31",
      payday: 25,
      dayIndex: 12,
      netIncome: 50_000,
      extraIncome: 0,
      totalSpent: 80_000,
      categories: [{ code: "food", budget: 40_000, spent: 80_000 }],
    });
    assert.equal(pace.alreadyShort, true);
    assert.equal(pace.todayAllowance, 0);
  });
});

describe("season and recommended budget", () => {
  it("maps months onto Japanese seasons", () => {
    assert.equal(seasonOfMonth(1), "winter");
    assert.equal(seasonOfMonth(4), "spring");
    assert.equal(seasonOfMonth(8), "summer");
    assert.equal(seasonOfMonth(10), "autumn");
  });

  it("keeps savings and scales the rest to past spending", () => {
    const suggestions = recommendFromHistory({
      netIncome: 100_000,
      lines: [
        { categoryCode: "housing", budgetAmount: 30_000 },
        { categoryCode: "insurance", budgetAmount: 10_000 },
        { categoryCode: "savings", budgetAmount: 20_000 },
        { categoryCode: "food", budgetAmount: 25_000 },
        { categoryCode: "daily", budgetAmount: 15_000 },
      ],
      periods: [
        { food: 10_000, daily: 30_000 },
        { food: 20_000, daily: 10_000 },
      ],
    });
    assert.ok(suggestions);
    const byCode = Object.fromEntries(suggestions.map((row) => [row.categoryCode, row]));
    assert.equal(byCode.savings?.recommended, 20_000);
    assert.equal(byCode.savings?.locked, true);
    assert.equal(byCode.housing?.recommended, 30_000);
    assert.equal(byCode.food?.recommended, 17_142);
    assert.equal(byCode.daily?.recommended, 22_858);
    const unlocked = suggestions.filter((row) => !row.locked);
    const locked = suggestions.filter((row) => row.locked);
    const sum =
      unlocked.reduce((total, row) => total + row.recommended, 0) +
      locked.reduce((total, row) => total + row.recommended, 0);
    assert.equal(sum, 100_000);
  });
});

describe("subscription detection", () => {
  it("finds a steady monthly charge and skips noisy or protected ones", () => {
    const hits = detectSubscriptions(
      [
        { ymd: "2026-08-05", amount: 1490, category: "telecom", label: "Netflix", recurring: false },
        { ymd: "2026-09-05", amount: 1490, category: "telecom", label: "Netflix", recurring: false },
        { ymd: "2026-08-02", amount: 1000, category: "food", label: "スーパー", recurring: false },
        { ymd: "2026-09-02", amount: 5400, category: "food", label: "スーパー", recurring: false },
        { ymd: "2026-08-01", amount: 80000, category: "housing", label: "家賃", recurring: true },
        { ymd: "2026-09-01", amount: 80000, category: "housing", label: "家賃", recurring: true },
        { ymd: "2026-09-03", amount: 980, category: "hobby_allowance", label: "音楽", recurring: true },
      ],
      [],
    );
    assert.deepEqual(
      hits.map((hit) => hit.label),
      ["Netflix", "音楽"],
    );
    assert.equal(hits[0]?.amount, 1490);
    assert.equal(hits[0]?.months, 2);
  });

  it("hides a dismissed subscription", () => {
    const hits = detectSubscriptions(
      [
        { ymd: "2026-08-05", amount: 1490, category: "telecom", label: "Netflix", recurring: false },
        { ymd: "2026-09-05", amount: 1490, category: "telecom", label: "Netflix", recurring: false },
      ],
      ["Netflix"],
    );
    assert.equal(hits.length, 0);
  });
});

describe("savings forecast and comparisons", () => {
  it("names the month the savings goal is reached", () => {
    const forecast = forecastSavings({
      goal: 500_000,
      saved: 200_000,
      monthlyPace: 60_000,
      today: "2026-10-16",
    });
    assert.equal(forecast.remaining, 300_000);
    assert.equal(forecast.monthsLeft, 5);
    assert.equal(forecast.etaYmd, "2027-03-16");
    assert.equal(forecast.achieved, false);
  });

  it("says the goal is already met", () => {
    const forecast = forecastSavings({
      goal: 100_000,
      saved: 100_000,
      monthlyPace: 10_000,
      today: "2026-10-16",
    });
    assert.equal(forecast.achieved, true);
    assert.equal(forecast.monthsLeft, 0);
    assert.equal(forecast.etaYmd, "2026-10-16");
  });

  it("does not invent a date without a pace", () => {
    const forecast = forecastSavings({
      goal: 100_000,
      saved: 10_000,
      monthlyPace: 0,
      today: "2026-10-16",
    });
    assert.equal(forecast.etaYmd, null);
    assert.equal(forecast.monthsLeft, null);
  });

  it("uses the plan when past savings average to zero", () => {
    assert.equal(savingsPace([0, 0], 40_000), 40_000);
    assert.equal(savingsPace([], 40_000), 40_000);
    assert.equal(savingsPace([60_000, 0, 30_000], 40_000), 30_000);
  });

  it("compares living spend and ignores savings", () => {
    assert.equal(livingSpend({ food: 1000, savings: 9000 }), 1000);
    assert.equal(percentChange(120, 100), 20);
    assert.equal(percentChange(80, 100), -20);
    assert.equal(percentChange(50, 0), null);
    assert.equal(percentChange(0, 0), 0);
  });

  it("puts the last amount first among quick presets", () => {
    assert.deepEqual(quickAmounts("JPY", 1280), [1280, 500, 1000, 3000]);
    assert.deepEqual(quickAmounts("JPY", 500), [500, 1000, 3000, 5000]);
  });

  it("ranks categories by the latest period", () => {
    const rows = buildCategoryTrends([
      { byCategory: { food: 1000, savings: 9000 } },
      { byCategory: { food: 2000, transport: 4000 } },
    ]);
    assert.equal(rows[0]?.categoryCode, "transport");
    assert.deepEqual(rows.find((row) => row.categoryCode === "food")?.points, [1000, 2000]);
    assert.equal(rows.some((row) => row.categoryCode === "savings"), false);
  });
});


