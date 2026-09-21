import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBudget, lineMap } from "./budget.ts";
import { BASE_RATIOS, CATEGORY_CODES } from "./categories.ts";
import { categoryAlert, monthSurplus } from "./alerts.ts";
import type { HouseholdType, HousingType } from "./types";

describe("ratio tables", () => {
  const types: HouseholdType[] = ["single", "couple", "family3", "family4"];
  const housing: HousingType[] = ["rent", "own"];
  const cars = [true, false];

  for (const type of types) {
    it(`${type} base ratios sum to 100`, () => {
      const sum = CATEGORY_CODES.reduce((s, c) => s + BASE_RATIOS[type][c], 0);
      assert.equal(sum, 100);
    });
  }

  for (const type of types) {
    for (const h of housing) {
      for (const car of cars) {
        it(`${type} / ${h} / car=${car} adjusted ratios sum to 100`, () => {
          const size = type === "single" ? 1 : type === "couple" ? 2 : type === "family3" ? 3 : 4;
          const result = computeBudget({
            netIncome: 300_000,
            householdSize: size,
            housingType: h,
            hasCar: car,
            housingActual: 50_000,
            insuranceActual: 5_000,
          });
          const sum = result.lines.reduce((s, l) => s + l.ratioPct, 0);
          assert.equal(sum, 100);
        });
      }
    }
  }
});

describe("golden: single / rent / no car / 300000 / housing 80000 / insurance 8000", () => {
  const result = computeBudget({
    netIncome: 300_000,
    householdSize: 1,
    housingType: "rent",
    hasCar: false,
    housingActual: 80_000,
    insuranceActual: 8_000,
  });
  const m = lineMap(result);

  it("applies car-off transport/savings split", () => {
    assert.equal(m.transport.ratioPct, 1);
    assert.equal(m.savings.ratioPct, 22);
    assert.equal(m.housing.ratioPct, 25);
  });

  it("overrides housing/insurance with actuals", () => {
    assert.equal(m.housing.budgetAmount, 80_000);
    assert.equal(m.insurance.budgetAmount, 8_000);
    assert.equal(m.housing.mandatoryOverride, true);
    assert.equal(m.insurance.mandatoryOverride, true);
    assert.equal(m.housing.compressed, false);
    assert.equal(m.insurance.compressed, false);
  });

  it("compresses 4000 from want categories, keeps savings", () => {
    assert.equal(result.overflowApplied, 4_000);
    assert.equal(m.savings.budgetAmount, 66_000);
    assert.equal(m.dining_leisure.compressed, true);
    assert.equal(m.fashion_beauty.compressed, true);
    assert.equal(m.social.compressed, true);
    assert.equal(m.hobby_allowance.compressed, true);
    assert.equal(m.other.compressed, true);
    assert.equal(m.food.compressed, false);
    const wantCut =
      (24_000 - m.dining_leisure.budgetAmount) +
      (15_000 - m.fashion_beauty.budgetAmount) +
      (15_000 - m.social.budgetAmount) +
      (30_000 - m.hobby_allowance.budgetAmount) +
      (6_000 - m.other.budgetAmount);
    assert.equal(wantCut, 4_000);
    assert.equal(m.dining_leisure.budgetAmount, 22_933);
    assert.equal(m.fashion_beauty.budgetAmount, 14_333);
    assert.equal(m.social.budgetAmount, 14_334);
    assert.equal(m.hobby_allowance.budgetAmount, 28_666);
    assert.equal(m.other.budgetAmount, 5_734);
  });

  it("sums to income when shortage is 0", () => {
    assert.equal(result.shortage, 0);
    const sum = result.lines.reduce((s, l) => s + l.budgetAmount, 0);
    assert.equal(sum, 300_000);
  });
});

describe("savings floor and remainder", () => {
  it("does not drop savings below 10% unless shortage", () => {
    const result = computeBudget({
      netIncome: 300_000,
      householdSize: 1,
      housingType: "rent",
      hasCar: true,
      housingActual: 50_000,
      insuranceActual: 5_000,
    });
    const savings = result.lines.find((l) => l.categoryCode === "savings")!;
    assert.ok(savings.budgetAmount >= Math.floor((300_000 * 10) / 100));
  });

  it("parks JPY remainder in savings so ΣB = I", () => {
    const result = computeBudget({
      netIncome: 100_001,
      householdSize: 1,
      housingType: "rent",
      hasCar: true,
      housingActual: 10_000,
      insuranceActual: 1_000,
    });
    assert.equal(result.shortage, 0);
    const sum = result.lines.reduce((s, l) => s + l.budgetAmount, 0);
    assert.equal(sum, 100_001);
  });

  it("reports shortage when mandatory costs exceed income", () => {
    const result = computeBudget({
      netIncome: 100_000,
      householdSize: 1,
      housingType: "rent",
      hasCar: true,
      housingActual: 90_000,
      insuranceActual: 30_000,
    });
    assert.ok(result.shortage > 0);
    const sum = result.lines.reduce((s, l) => s + l.budgetAmount, 0);
    assert.ok(sum > 100_000);
    const housing = result.lines.find((l) => l.categoryCode === "housing")!;
    const insurance = result.lines.find((l) => l.categoryCode === "insurance")!;
    assert.equal(housing.budgetAmount, 90_000);
    assert.equal(insurance.budgetAmount, 30_000);
  });
});

describe("alerts", () => {
  it("turns red at exactly 80% remaining", () => {
    const hit = categoryAlert({
      budget: 1000,
      spent: 800,
      isCurrentMonth: false,
      dayIndex: 15,
      monthDays: 30,
    });
    const miss = categoryAlert({
      budget: 10000,
      spent: 7999,
      isCurrentMonth: false,
      dayIndex: 15,
      monthDays: 30,
    });
    assert.equal(hit.remainingAlert, true);
    assert.equal(hit.red, true);
    assert.equal(miss.remainingAlert, false);
  });

  it("turns red when budget is 0 and spent > 0", () => {
    const a = categoryAlert({
      budget: 0,
      spent: 1,
      isCurrentMonth: true,
      dayIndex: 10,
      monthDays: 30,
    });
    const b = categoryAlert({
      budget: 0,
      spent: 0,
      isCurrentMonth: true,
      dayIndex: 10,
      monthDays: 30,
    });
    assert.equal(a.red, true);
    assert.equal(b.red, false);
  });

  it("skips pace on day 1", () => {
    const a = categoryAlert({
      budget: 100,
      spent: 90,
      isCurrentMonth: true,
      dayIndex: 1,
      monthDays: 30,
    });
    assert.equal(a.paceAlert, false);
  });

  it("flags mid-month 70% as pace red when elapsed is 50%", () => {
    const a = categoryAlert({
      budget: 100,
      spent: 70,
      isCurrentMonth: true,
      dayIndex: 15,
      monthDays: 30,
    });
    assert.equal(a.paceAlert, true);
    assert.equal(a.red, true);
  });

  it("does not flag pace on past months", () => {
    const a = categoryAlert({
      budget: 100,
      spent: 70,
      isCurrentMonth: false,
      dayIndex: 15,
      monthDays: 30,
    });
    assert.equal(a.paceAlert, false);
  });
});

describe("month surplus", () => {
  it("creates leftover only when positive", () => {
    assert.equal(
      monthSurplus({ netIncome: 100, spentNonSavings: 70, spentSavingsUser: 10 }),
      20,
    );
    assert.equal(
      monthSurplus({ netIncome: 100, spentNonSavings: 90, spentSavingsUser: 20 }),
      -10,
    );
  });
});
