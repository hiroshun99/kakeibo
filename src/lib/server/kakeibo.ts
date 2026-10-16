import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { categoryAlert, monthSurplus } from "@/lib/kakeibo/alerts";
import { CATEGORIES, categoryLabel } from "@/lib/kakeibo/categories";
import { computeBudget } from "@/lib/kakeibo/budget";
import {
  compareYearMonth,
  householdTimeZone,
  zonedNow,
} from "@/lib/kakeibo/dates";
import { categoryCarry } from "@/lib/kakeibo/rollover";
import {
  addDays,
  boundsOf,
  clampPayday,
  daysInclusive,
  isPeriodId,
  periodContaining,
  periodLabel,
  shiftPeriodId,
  weekBudget,
  weekWindow,
  type CycleMode,
} from "@/lib/kakeibo/periods";
import { detectSubscriptions, detectWatch, merchantKey, type SubscriptionHit, type WatchHit } from "@/lib/kakeibo/watch";
import {
  cashPace,
  recommendFromHistory,
  seasonOfMonth,
  type Season,
} from "@/lib/kakeibo/pace";
import {
  buildCategoryTrends,
  forecastSavings,
  livingSpend,
  savingsPace,
  type SavingsForecast,
} from "@/lib/kakeibo/insights";
import type {
  CategoryCode,
  Currency,
  HousingType,
  Locale,
  ProfileInput,
} from "@/lib/kakeibo/types";
import { CURRENCIES } from "@/lib/kakeibo/types";
import { AppError } from "./errors";
import { requireVerified } from "./auth-flows";

type Sql = Awaited<ReturnType<typeof getSql>>;

type ProfileRow = {
  id: string;
  user_id: string;
  locale: Locale;
  currency: Currency;
  net_income: number;
  household_size: number;
  housing_type: HousingType;
  has_car: boolean;
  housing_actual: number;
  insurance_actual: number;
  onboarding_completed_at: string | Date | null;
  cycle_mode: CycleMode;
  payday: number;
  rollover: boolean;
  savings_goal: number;
};

type BudgetRow = {
  id: string;
  user_id: string;
  year_month: string;
  net_income_snapshot: number;
  shortage: number;
  closed: boolean;
  system_txn_status: "none" | "active" | "user_deleted";
};

type LineRow = {
  category_code: CategoryCode;
  ratio_pct: number;
  budget_amount: number;
  compressed: boolean;
  mandatory_override: boolean;
};

export type PublicProfile = {
  locale: Locale;
  currency: Currency;
  netIncome: number;
  householdSize: number;
  housingType: HousingType;
  hasCar: boolean;
  housingActual: number;
  insuranceActual: number;
  onboardingCompleted: boolean;
  cycleMode: CycleMode;
  payday: number;
  rollover: boolean;
  savingsGoal: number;
};

export type HomeCategory = {
  categoryCode: CategoryCode;
  label: string;
  ratioPct: number;
  budgetAmount: number;
  spent: number;
  remaining: number;
  compressed: boolean;
  mandatoryOverride: boolean;
  red: boolean;
  remainingAlert: boolean;
  paceAlert: boolean;
  carry: number;
  seasonal: number;
};

export type HomePayload = {
  profile: PublicProfile;
  currentYearMonth: string;
  todayYmd: string;
  month: string;
  isCurrentMonth: boolean;
  dayIndex: number;
  monthDays: number;
  shortage: number;
  netIncome: number;
  totalSpent: number;
  remaining: number;
  hasBudget: boolean;
  categories: HomeCategory[];
  periodLabel: string;
  extraIncome: number;
  week: { budget: number; spent: number; remaining: number; range: string } | null;
  hikes: WatchHit[];
  cancels: WatchHit[];
  season: Season;
  pace: {
    todayAllowance: number;
    untilPayday: number;
    paydayDate: string;
    days: number;
    shortfallDate: string | null;
    alreadyShort: boolean;
  } | null;
  recommendations: {
    categoryCode: CategoryCode;
    label: string;
    current: number;
    recommended: number;
    locked: boolean;
  }[] | null;
  compare: {
    current: number;
    previous: number;
    yearAgo: number;
  };
  savingsForecast: SavingsForecast | null;
  subscriptions: SubscriptionHit[];
  quick: { categoryCode: CategoryCode; label: string; lastAmount: number }[];
};

export type TxnPayload = {
  id: string;
  categoryCode: CategoryCode;
  amount: number;
  txnDate: string;
  memo: string | null;
  source: "user" | "system";
  createdAt: string;
  merchant: string | null;
  recurring: boolean;
  kind: "expense" | "income";
  incomeAllocation: "pool" | "savings" | null;
  receiptId: string | null;
};

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function toPublic(row: ProfileRow): PublicProfile {
  return {
    locale: row.locale,
    currency: row.currency,
    netIncome: Number(row.net_income),
    householdSize: Number(row.household_size),
    housingType: row.housing_type,
    hasCar: asBool(row.has_car),
    housingActual: Number(row.housing_actual),
    insuranceActual: Number(row.insurance_actual),
    onboardingCompleted: Boolean(row.onboarding_completed_at),
    cycleMode: row.cycle_mode === "payday" ? "payday" : "calendar",
    payday: clampPayday(Number(row.payday)),
    rollover: asBool(row.rollover),
    savingsGoal: Number(row.savings_goal ?? 0),
  };
}

async function loadProfile(sql: Sql, userId: string): Promise<ProfileRow | null> {
  const rows = await sql<ProfileRow>`
    select id, user_id, locale, currency, net_income, household_size, housing_type,
           has_car, housing_actual, insurance_actual, onboarding_completed_at,
           cycle_mode, payday, rollover, savings_goal
    from household_profiles
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

function leftoverMemo(locale: Locale): string {
  return locale === "ja" ? "前月余り" : "Previous month leftover";
}

async function persistBudget(
  sql: Sql,
  userId: string,
  yearMonth: string,
  profile: ProfileRow,
  replace: boolean,
): Promise<BudgetRow> {
  const existing = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId} and year_month = ${yearMonth}
    limit 1
  `;
  if (existing[0] && !replace) return existing[0];

  const computed = computeBudget({
    netIncome: Number(profile.net_income),
    householdSize: Number(profile.household_size),
    housingType: profile.housing_type,
    hasCar: asBool(profile.has_car),
    housingActual: Number(profile.housing_actual),
    insuranceActual: Number(profile.insurance_actual),
  });

  const id = existing[0]?.id ?? crypto.randomUUID();
  if (existing[0]) {
    await sql`
      update monthly_budgets
      set net_income_snapshot = ${computed.netIncome},
          shortage = ${computed.shortage},
          generated_at = now()
      where id = ${id} and user_id = ${userId}
    `;
    await sql`delete from monthly_budget_lines where monthly_budget_id = ${id}`;
  } else {
    await sql`
      insert into monthly_budgets (
        id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
      ) values (
        ${id}, ${userId}, ${yearMonth}, ${computed.netIncome}, ${computed.shortage}, false, 'none'
      )
    `;
  }
  for (const line of computed.lines) {
    await sql`
      insert into monthly_budget_lines (
        id, monthly_budget_id, category_code, ratio_pct, budget_amount, compressed, mandatory_override
      ) values (
        ${crypto.randomUUID()}, ${id}, ${line.categoryCode}, ${line.ratioPct},
        ${line.budgetAmount}, ${line.compressed}, ${line.mandatoryOverride}
      )
    `;
  }
  const rows = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets where id = ${id}
  `;
  return rows[0]!;
}

async function spentBreakdown(
  sql: Sql,
  userId: string,
  periodId: string,
): Promise<{
  byCategory: Record<string, number>;
  nonSavings: number;
  savingsUser: number;
}> {
  const { start, end } = boundsOf(periodId);
  const rows = await sql<{ category_code: string; source: string; spent: number }>`
    select category_code, source, coalesce(sum(amount), 0) as spent
    from transactions
    where user_id = ${userId}
      and txn_date >= ${start}
      and txn_date <= ${end}
      and deleted_at is null
      and kind = 'expense'
    group by category_code, source
  `;
  const byCategory: Record<string, number> = {};
  let nonSavings = 0;
  let savingsUser = 0;
  for (const row of rows) {
    const amount = Number(row.spent);
    byCategory[row.category_code] = (byCategory[row.category_code] ?? 0) + amount;
    if (row.category_code === "savings") {
      if (row.source === "user") savingsUser += amount;
    } else {
      nonSavings += amount;
    }
  }
  return { byCategory, nonSavings, savingsUser };
}

async function incomeBreakdown(
  sql: Sql,
  userId: string,
  periodId: string,
): Promise<{ pool: number; savings: number }> {
  const { start, end } = boundsOf(periodId);
  const rows = await sql<{ income_allocation: string | null; total: number }>`
    select income_allocation, coalesce(sum(amount), 0) as total
    from transactions
    where user_id = ${userId}
      and kind = 'income'
      and deleted_at is null
      and txn_date >= ${start}
      and txn_date <= ${end}
    group by income_allocation
  `;
  let pool = 0;
  let savings = 0;
  for (const row of rows) {
    const amount = Number(row.total);
    if (row.income_allocation === "savings") savings += amount;
    else pool += amount;
  }
  return { pool, savings };
}

async function findSystemTxn(
  sql: Sql,
  userId: string,
  periodId: string,
): Promise<{ id: string; deleted_at: string | Date | null; amount: number } | null> {
  const { start, end } = boundsOf(periodId);
  const rows = await sql<{ id: string; deleted_at: string | Date | null; amount: number }>`
    select id, deleted_at, amount
    from transactions
    where user_id = ${userId}
      and source = 'system'
      and category_code = 'savings'
      and txn_date >= ${start}
      and txn_date <= ${end}
    order by created_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

async function syncSurplus(
  sql: Sql,
  userId: string,
  budget: BudgetRow,
  locale: Locale,
  firstClose: boolean,
): Promise<void> {
  const { nonSavings, savingsUser } = await spentBreakdown(sql, userId, budget.year_month);
  const extra = await incomeBreakdown(sql, userId, budget.year_month);
  const surplus = monthSurplus({
    netIncome: Number(budget.net_income_snapshot) + extra.pool + extra.savings,
    spentNonSavings: nonSavings,
    spentSavingsUser: savingsUser,
  });
  const existing = await findSystemTxn(sql, userId, budget.year_month);
  let status = budget.system_txn_status;

  if (existing?.deleted_at) {
    status = "user_deleted";
  }

  if (status === "user_deleted") {
    await sql`
      update monthly_budgets set system_txn_status = 'user_deleted', closed = true
      where id = ${budget.id} and user_id = ${userId}
    `;
    return;
  }

  if (surplus > 0) {
    const lastDay = boundsOf(budget.year_month).end;
    const memo = leftoverMemo(locale);
    if (existing && !existing.deleted_at) {
      await sql`
        update transactions
        set amount = ${surplus}, memo = ${memo}, updated_at = now()
        where id = ${existing.id} and user_id = ${userId}
      `;
      status = "active";
    } else if (!existing && (firstClose || budget.closed)) {
      await sql`
        insert into transactions (
          id, user_id, category_code, amount, txn_date, memo, source
        ) values (
          ${crypto.randomUUID()}, ${userId}, 'savings', ${surplus}, ${lastDay}, ${memo}, 'system'
        )
      `;
      status = "active";
    }
  } else if (existing && !existing.deleted_at) {
    await sql`
      delete from transactions
      where id = ${existing.id} and user_id = ${userId} and source = 'system'
    `;
    status = "none";
  }

  await sql`
    update monthly_budgets
    set closed = true, system_txn_status = ${status}
    where id = ${budget.id} and user_id = ${userId}
  `;
}

async function ensureLifecycle(sql: Sql, userId: string, profile: ProfileRow): Promise<void> {
  if (!profile.onboarding_completed_at) return;
  const zone = householdTimeZone(profile.currency);
  const now = zonedNow(zone);
  const currentId = periodContaining(
    now.ymd,
    profile.cycle_mode === "payday" ? "payday" : "calendar",
    Number(profile.payday),
  ).id;

  const budgets = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId}
    order by year_month
  `;

  for (const b of budgets) {
    if (!asBool(b.closed) && compareYearMonth(b.year_month, currentId) < 0) {
      await syncSurplus(sql, userId, b, profile.locale, true);
    }
  }

  const hasCurrent = budgets.some((b) => b.year_month === currentId);
  if (!hasCurrent) {
    await persistBudget(sql, userId, currentId, profile, false);
  }
}

function profilePeriodId(profile: ProfileRow, ymd?: string): string {
  const zone = householdTimeZone(profile.currency);
  const today = ymd ?? zonedNow(zone).ymd;
  return periodContaining(
    today,
    profile.cycle_mode === "payday" ? "payday" : "calendar",
    Number(profile.payday),
  ).id;
}

function parseLocale(value: unknown): Locale {
  if (value === "ja" || value === "en") return value;
  throw new AppError("invalid", "invalid locale", 400);
}
function parseCurrency(value: unknown): Currency {
  if (value === "JPY" || value === "MYR") return value;
  throw new AppError("invalid", "invalid currency", 400);
}
function parseHousing(value: unknown): HousingType {
  if (value === "rent" || value === "own") return value;
  throw new AppError("invalid", "invalid housing", 400);
}

function parseProfileInput(data: {
  locale: string;
  currency?: string;
  netIncome: number;
  householdSize: number;
  housingType: string;
  hasCar: boolean;
  housingActual: number;
  insuranceActual: number;
  cycleMode?: string;
  payday?: number;
  rollover?: boolean;
  savingsGoal?: number;
}): Omit<ProfileInput, "currency"> & {
  currency?: Currency;
  cycleMode?: CycleMode;
  payday?: number;
  rollover?: boolean;
  savingsGoal?: number;
} {
  const locale = parseLocale(data.locale);
  const housingType = parseHousing(data.housingType);
  const netIncome = Math.trunc(Number(data.netIncome));
  const householdSize = Math.trunc(Number(data.householdSize));
  const housingActual = Math.trunc(Number(data.housingActual));
  const insuranceActual = Math.trunc(Number(data.insuranceActual));
  if (!Number.isFinite(netIncome) || netIncome <= 0) {
    throw new AppError("invalid", "income", 400);
  }
  if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 20) {
    throw new AppError("invalid", "household", 400);
  }
  if (!Number.isFinite(housingActual) || housingActual < 0) {
    throw new AppError("invalid", "housing", 400);
  }
  if (!Number.isFinite(insuranceActual) || insuranceActual < 0) {
    throw new AppError("invalid", "insurance", 400);
  }
  let cycleMode: CycleMode | undefined;
  if (data.cycleMode != null) {
    if (data.cycleMode !== "calendar" && data.cycleMode !== "payday") {
      throw new AppError("invalid", "cycle", 400);
    }
    cycleMode = data.cycleMode;
  }
  const payday = data.payday == null ? undefined : clampPayday(Number(data.payday));
  const rollover = data.rollover == null ? undefined : Boolean(data.rollover);
  let savingsGoal: number | undefined;
  if (data.savingsGoal != null) {
    const goal = Math.trunc(Number(data.savingsGoal));
    if (!Number.isFinite(goal) || goal < 0 || goal > 1_000_000_000_000) {
      throw new AppError("invalid", "goal", 400);
    }
    savingsGoal = goal;
  }
  return {
    locale,
    currency: data.currency ? parseCurrency(data.currency) : undefined,
    netIncome,
    householdSize,
    housingType,
    hasCar: Boolean(data.hasCar),
    housingActual,
    insuranceActual,
    cycleMode,
    payday,
    rollover,
    savingsGoal,
  };
}

export const getBootstrap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const { ensureVerifiedForAuthKind } = await import("./auth-flows");
    const verified = await ensureVerifiedForAuthKind(context.userId);
    return {
      emailVerified: verified,
      profile: profile ? toPublic(profile) : null,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      locale: string;
      currency?: string;
      netIncome: number;
      householdSize: number;
      housingType: string;
      hasCar: boolean;
      housingActual: number;
      insuranceActual: number;
      cycleMode?: string;
      payday?: number;
      rollover?: boolean;
      savingsGoal?: number;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const parsed = parseProfileInput(data);
    const sql = await getSql();
    const existing = await loadProfile(sql, context.userId);
    if (!existing) {
      if (!parsed.currency || !CURRENCIES.includes(parsed.currency)) {
        throw new AppError("invalid", "currency", 400);
      }
      await sql`
        insert into household_profiles (
          id, user_id, locale, currency, net_income, household_size, housing_type,
          has_car, housing_actual, insurance_actual, cycle_mode, payday, rollover
        ) values (
          ${crypto.randomUUID()}, ${context.userId}, ${parsed.locale}, ${parsed.currency},
          ${parsed.netIncome}, ${parsed.householdSize}, ${parsed.housingType},
          ${parsed.hasCar}, ${parsed.housingActual}, ${parsed.insuranceActual},
          ${parsed.cycleMode ?? "calendar"}, ${parsed.payday ?? 25}, ${parsed.rollover ?? true}
        )
      `;
    } else {
      await sql`
        update household_profiles
        set locale = ${parsed.locale},
            net_income = ${parsed.netIncome},
            household_size = ${parsed.householdSize},
            housing_type = ${parsed.housingType},
            has_car = ${parsed.hasCar},
            housing_actual = ${parsed.housingActual},
            insurance_actual = ${parsed.insuranceActual},
            cycle_mode = coalesce(${parsed.cycleMode ?? null}, cycle_mode),
            payday = coalesce(${parsed.payday ?? null}, payday),
            rollover = coalesce(${parsed.rollover ?? null}, rollover),
            savings_goal = coalesce(${parsed.savingsGoal ?? null}, savings_goal),
            updated_at = now()
        where user_id = ${context.userId}
      `;
    }
    const profile = (await loadProfile(sql, context.userId))!;
    if (profile.onboarding_completed_at) {
      const ym = profilePeriodId(profile);
      await persistBudget(sql, context.userId, ym, profile, true);
    }
    return { profile: toPublic(profile) };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new AppError("invalid", "profile", 400);
    if (!profile.onboarding_completed_at) {
      await sql`
        update household_profiles
        set onboarding_completed_at = now(), updated_at = now()
        where user_id = ${context.userId}
      `;
    }
    const next = (await loadProfile(sql, context.userId))!;
    const ym = profilePeriodId(next);
    await persistBudget(sql, context.userId, ym, next, true);
    return { profile: toPublic(next) };
  });

export const previewBudget = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new AppError("invalid", "profile", 400);
    const computed = computeBudget({
      netIncome: Number(profile.net_income),
      householdSize: Number(profile.household_size),
      housingType: profile.housing_type,
      hasCar: asBool(profile.has_car),
      housingActual: Number(profile.housing_actual),
      insuranceActual: Number(profile.insurance_actual),
    });
    return {
      profile: toPublic(profile),
      shortage: computed.shortage,
      overflowApplied: computed.overflowApplied,
      householdType: computed.householdType,
      lines: computed.lines.map((l) => ({
        ...l,
        label: categoryLabel(l.categoryCode, profile.locale),
      })),
    };
  });

async function buildHome(
  sql: Sql,
  userId: string,
  profile: ProfileRow,
  month: string | undefined,
): Promise<HomePayload> {
  await ensureLifecycle(sql, userId, profile);
  const zone = householdTimeZone(profile.currency);
  const now = zonedNow(zone);
  const currentId = profilePeriodId(profile, now.ymd);
  const ym = month && isPeriodId(month) ? month : currentId;
  const bounds = boundsOf(ym);
  const isCurrentMonth = ym === currentId;
  const periodDays = daysInclusive(bounds.start, bounds.end);
  const dayIndex = isCurrentMonth
    ? Math.min(periodDays, daysInclusive(bounds.start, now.ymd))
    : periodDays;

  let budgets = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId} and year_month = ${ym}
    limit 1
  `;
  if (!budgets[0] && ym === currentId) {
    await persistBudget(sql, userId, ym, profile, false);
    budgets = await sql<BudgetRow>`
      select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
      from monthly_budgets
      where user_id = ${userId} and year_month = ${ym}
      limit 1
    `;
  }
  const budget = budgets[0];
  if (budget && asBool(budget.closed)) {
    await syncSurplus(sql, userId, budget, profile.locale, false);
  }

  const lines = budget
    ? await sql<LineRow>`
        select category_code, ratio_pct, budget_amount, compressed, mandatory_override
        from monthly_budget_lines
        where monthly_budget_id = ${budget.id}
      `
    : [];
  const lineByCode = new Map(lines.map((l) => [l.category_code, l]));
  const spent = await spentBreakdown(sql, userId, ym);
  const prevId = shiftPeriodId(ym, -1);
  const prevLines = await sql<LineRow>`
    select l.category_code, l.ratio_pct, l.budget_amount, l.compressed, l.mandatory_override
    from monthly_budget_lines l
    join monthly_budgets b on b.id = l.monthly_budget_id
    where b.user_id = ${userId} and b.year_month = ${prevId}
  `;
  const prevSpent = prevLines.length ? await spentBreakdown(sql, userId, prevId) : null;
  const carry = categoryCarry(
    prevLines.map((l) => ({
      categoryCode: l.category_code,
      budgetAmount: Number(l.budget_amount),
    })),
    prevSpent?.byCategory ?? {},
    asBool(profile.rollover),
  );
  const extra = await incomeBreakdown(sql, userId, ym);
  const season = seasonOfMonth(Number(bounds.start.slice(5, 7)));
  const seasonRows = await sql<{ category_code: CategoryCode; extra_amount: number }>`
    select category_code, extra_amount
    from seasonal_adjustments
    where user_id = ${userId} and season = ${season}
  `;
  const seasonExtra = new Map(
    seasonRows
      .filter((row) => row.category_code !== "savings")
      .map((row) => [row.category_code, Number(row.extra_amount)]),
  );
  const netIncome = budget ? Number(budget.net_income_snapshot) : Number(profile.net_income);
  const shortage = budget ? Number(budget.shortage) : 0;

  const categories: HomeCategory[] = CATEGORIES.map((cat) => {
    const line = lineByCode.get(cat.code);
    const base = line ? Number(line.budget_amount) : 0;
    const carriedRaw = carry[cat.code] ?? 0;
    const savingsBoost = cat.code === "savings" ? extra.savings : 0;
    const baseWith = base + savingsBoost;
    const carried = carriedRaw < 0 ? Math.max(carriedRaw, -baseWith) : carriedRaw;
    const seasonal = cat.code === "savings" ? 0 : (seasonExtra.get(cat.code) ?? 0);
    const budgetAmount = Math.max(0, baseWith + carried + seasonal);
    const spentAmt = spent.byCategory[cat.code] ?? 0;
    const alert = categoryAlert({
      budget: budgetAmount,
      spent: spentAmt,
      isCurrentMonth,
      dayIndex,
      monthDays: periodDays,
    });
    return {
      categoryCode: cat.code,
      label: categoryLabel(cat.code, profile.locale),
      ratioPct: line ? Number(line.ratio_pct) : 0,
      budgetAmount,
      spent: spentAmt,
      remaining: budgetAmount - spentAmt,
      compressed: line ? asBool(line.compressed) : false,
      mandatoryOverride: line ? asBool(line.mandatory_override) : false,
      red: alert.red,
      remainingAlert: alert.remainingAlert,
      paceAlert: alert.paceAlert,
      carry: carried,
      seasonal,
    };
  });

  const totalSpent = Object.values(spent.byCategory).reduce((s, n) => s + n, 0);
  const extraIncome = extra.pool + extra.savings;
  const weekSkip = new Set(["savings", "housing", "insurance"]);
  const spendable = categories
    .filter((c) => !weekSkip.has(c.categoryCode))
    .reduce((s, c) => s + c.budgetAmount, 0);
  const weekSlice = isCurrentMonth ? weekWindow(bounds.start, bounds.end, now.ymd) : null;
  let week: HomePayload["week"] = null;
  if (weekSlice) {
    const rows = await sql<{ spent: number }>`
      select coalesce(sum(amount), 0) as spent
      from transactions
      where user_id = ${userId}
        and kind = 'expense'
        and category_code not in ('savings', 'housing', 'insurance')
        and deleted_at is null
        and txn_date >= ${weekSlice.start}
        and txn_date <= ${weekSlice.end}
    `;
    const weekSpent = Number(rows[0]?.spent ?? 0);
    const budgetAmount = weekBudget(spendable, periodDays, weekSlice.days);
    const md = (ymd: string) => {
      const parts = ymd.split("-");
      return `${Number(parts[1])}/${Number(parts[2])}`;
    };
    week = {
      budget: budgetAmount,
      spent: weekSpent,
      remaining: budgetAmount - weekSpent,
      range: `${md(weekSlice.start)}–${md(weekSlice.end)}`,
    };
  }

  const watchFrom = shiftPeriodId(/^\d{4}-\d{2}/.test(ym) ? ym.slice(0, 7) : now.yearMonth, -8);
  const watchStart = /^\d{4}-\d{2}-\d{2}$/.test(watchFrom) ? watchFrom : `${watchFrom}-01`;
  const chargeRows = await sql<{
    merchant: string | null;
    memo: string | null;
    amount: number;
    txn_date: string;
    category_code: CategoryCode;
    recurring: boolean;
  }>`
    select merchant, memo, amount, txn_date, category_code, recurring
    from transactions
    where user_id = ${userId}
      and source = 'user'
      and kind = 'expense'
      and deleted_at is null
      and txn_date >= ${watchStart}
    order by txn_date desc
    limit 500
  `;
  const dismissed = await sql<{ merchant_key: string; kind: string }>`
    select merchant_key, kind from watch_dismissals where user_id = ${userId}
  `;
  const watchCharges = chargeRows.map((row) => ({
    ymd: String(row.txn_date).slice(0, 10),
    amount: Number(row.amount),
    category: row.category_code,
    label: (row.merchant || row.memo || "").trim(),
    recurring: asBool(row.recurring),
  }));
  const watches = detectWatch(
    watchCharges,
    dismissed
      .filter(
        (row): row is { merchant_key: string; kind: "hike" | "cancel" } =>
          row.kind === "hike" || row.kind === "cancel",
      )
      .map((row) => ({ key: row.merchant_key, kind: row.kind })),
  );
  const subscriptions = isCurrentMonth
    ? detectSubscriptions(
        watchCharges,
        dismissed.filter((row) => row.kind === "subscription").map((row) => row.merchant_key),
      )
    : [];

  const pace = isCurrentMonth
    ? cashPace({
        today: now.ymd,
        periodEnd: bounds.end,
        payday: clampPayday(Number(profile.payday)),
        dayIndex,
        netIncome,
        extraIncome,
        totalSpent,
        categories: categories.map((category) => ({
          code: category.categoryCode,
          budget: category.budgetAmount,
          spent: category.spent,
        })),
      })
    : null;

  const history = budget ? await recentSpends(sql, userId, ym) : [];
  const suggested = budget
    ? recommendFromHistory({
        netIncome,
        lines: lines.map((line) => ({
          categoryCode: line.category_code,
          budgetAmount: Number(line.budget_amount),
        })),
        periods: history,
      })
    : null;
  const recommendations =
    isCurrentMonth && suggested?.some((row) => !row.locked && row.recommended !== row.current)
    ? [
        ...suggested.filter((row) => row.categoryCode === "savings"),
        ...suggested.filter((row) => !row.locked && row.recommended !== row.current).slice(0, 5),
      ].map((row) => ({
        ...row,
        label: categoryLabel(row.categoryCode, profile.locale),
      }))
    : null;

  const previousSpent = await spentBreakdown(sql, userId, shiftPeriodId(ym, -1));
  const yearAgoSpent = await spentBreakdown(sql, userId, shiftPeriodId(ym, -12));
  const compare = {
    current: livingSpend(spent.byCategory),
    previous: livingSpend(previousSpent.byCategory),
    yearAgo: livingSpend(yearAgoSpent.byCategory),
  };

  let savingsForecast: SavingsForecast | null = null;
  if (isCurrentMonth && Number(profile.savings_goal) > 0) {
    const savedRows = await sql<{ saved: number }>`
      select coalesce(sum(amount), 0) as saved
      from transactions
      where user_id = ${userId}
        and category_code = 'savings'
        and kind = 'expense'
        and deleted_at is null
    `;
    const priorBudgets = await sql<{ year_month: string }>`
      select year_month from monthly_budgets
      where user_id = ${userId} and year_month < ${ym}
      order by year_month desc
      limit 3
    `;
    const priorSavings: number[] = [];
    for (const prior of priorBudgets) {
      const breakdown = await spentBreakdown(sql, userId, prior.year_month);
      priorSavings.push(breakdown.byCategory.savings ?? 0);
    }
    const planned = Number(lineByCode.get("savings")?.budget_amount ?? 0) + extra.savings;
    savingsForecast = forecastSavings({
      goal: Number(profile.savings_goal),
      saved: Number(savedRows[0]?.saved ?? 0),
      monthlyPace: savingsPace(priorSavings, planned),
      today: now.ymd,
    });
  }
  const quick = isCurrentMonth ? await quickCategories(sql, userId, profile.locale, now.ymd) : [];

  return {
    profile: toPublic(profile),
    currentYearMonth: currentId,
    todayYmd: now.ymd,
    month: ym,
    isCurrentMonth,
    dayIndex,
    monthDays: periodDays,
    shortage,
    netIncome,
    totalSpent,
    remaining: netIncome + extraIncome - totalSpent,
    hasBudget: Boolean(budget),
    categories,
    periodLabel: periodLabel(ym, profile.locale),
    extraIncome,
    week,
    hikes: watches.hikes,
    cancels: watches.cancels,
    season,
    pace,
    recommendations,
    compare,
    savingsForecast,
    subscriptions,
    quick,
  };
}

export const loadHome = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { month?: string } | undefined) => data ?? {})
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) {
      throw new AppError("onboarding", "incomplete", 400);
    }
    return buildHome(sql, context.userId, profile, data?.month);
  });

export const loadTransactions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { month?: string } | undefined) => data ?? {})
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) {
      throw new AppError("onboarding", "incomplete", 400);
    }
    await ensureLifecycle(sql, context.userId, profile);
    const zone = householdTimeZone(profile.currency);
    const now = zonedNow(zone);
    const currentId = profilePeriodId(profile, now.ymd);
    const ym = data?.month && isPeriodId(data.month) ? data.month : currentId;
    const { start, end } = boundsOf(ym);
    const rows = await sql<{
      id: string;
      category_code: CategoryCode;
      amount: number;
      txn_date: string;
      memo: string | null;
      source: "user" | "system";
      created_at: string | Date;
      merchant: string | null;
      recurring: boolean;
      kind: "expense" | "income";
      income_allocation: "pool" | "savings" | null;
      receipt_id: string | null;
    }>`
      select id, category_code, amount, txn_date, memo, source, created_at,
             merchant, recurring, kind, income_allocation, receipt_id
      from transactions
      where user_id = ${context.userId}
        and txn_date >= ${start}
        and txn_date <= ${end}
        and deleted_at is null
      order by txn_date desc, created_at desc
    `;
    const items: TxnPayload[] = rows.map((r) => ({
      id: r.id,
      categoryCode: r.category_code,
      amount: Number(r.amount),
      txnDate: String(r.txn_date).slice(0, 10),
      memo: r.memo,
      source: r.source,
      createdAt: iso(r.created_at) ?? "",
      merchant: r.merchant,
      recurring: asBool(r.recurring),
      kind: r.kind === "income" ? "income" : "expense",
      incomeAllocation: r.income_allocation === "savings" ? "savings" : r.income_allocation === "pool" ? "pool" : null,
      receiptId: r.receipt_id,
    }));
    return {
      month: ym,
      periodLabel: periodLabel(ym, profile.locale),
      currentYearMonth: currentId,
      todayYmd: now.ymd,
      profile: toPublic(profile),
      items,
    };
  });

function parseTxnInput(data: {
  amount: number;
  categoryCode: string;
  txnDate: string;
  memo?: string | null;
}) {
  const amount = Math.trunc(Number(data.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("invalid", "amount", 400);
  const category = CATEGORIES.find((c) => c.code === data.categoryCode);
  if (!category) throw new AppError("invalid", "category", 400);
  const txnDate = String(data.txnDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) throw new AppError("invalid", "date", 400);
  const memoRaw = (data.memo ?? "").trim();
  if (memoRaw.length > 100) throw new AppError("invalid", "memo", 400);
  return {
    amount,
    categoryCode: category.code as CategoryCode,
    txnDate,
    memo: memoRaw.length ? memoRaw : null,
  };
}

async function afterTxnChange(sql: Sql, userId: string, profile: ProfileRow, txnDate: string) {
  const periodId = profilePeriodId(profile, txnDate);
  const currentId = profilePeriodId(profile);
  if (compareYearMonth(periodId, currentId) >= 0) return;
  const budgets = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId} and year_month = ${periodId}
    limit 1
  `;
  if (budgets[0] && asBool(budgets[0].closed)) {
    await syncSurplus(sql, userId, budgets[0], profile.locale, false);
  }
}

type EntryLine = { categoryCode: CategoryCode; amount: number };

function parseEntry(data: {
  amount?: number;
  categoryCode?: string;
  txnDate: string;
  memo?: string | null;
  merchant?: string | null;
  recurring?: boolean;
  kind?: string;
  incomeAllocation?: string;
  lines?: { categoryCode: string; amount: number }[];
}) {
  const txnDate = String(data.txnDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) throw new AppError("invalid", "date", 400);
  const memoRaw = (data.memo ?? "").trim();
  if (memoRaw.length > 100) throw new AppError("invalid", "memo", 400);
  const merchantRaw = (data.merchant ?? "").trim();
  if (merchantRaw.length > 40) throw new AppError("invalid", "merchant", 400);
  const kind = data.kind === "income" ? "income" : "expense";
  const allocation = data.incomeAllocation === "savings" ? "savings" : "pool";
  const raw =
    kind === "income"
      ? [{ categoryCode: allocation === "savings" ? "savings" : "other", amount: data.amount }]
      : data.lines?.length
        ? data.lines
        : [{ categoryCode: data.categoryCode ?? "", amount: data.amount }];
  if (raw.length < 1 || raw.length > 6) throw new AppError("invalid", "lines", 400);
  const lines: EntryLine[] = raw.map((line) => {
    const amount = Math.trunc(Number(line.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError("invalid", "amount", 400);
    const category = CATEGORIES.find((c) => c.code === line.categoryCode);
    if (!category) throw new AppError("invalid", "category", 400);
    return { categoryCode: category.code, amount };
  });
  return {
    txnDate,
    memo: memoRaw.length ? memoRaw : null,
    merchant: merchantRaw.length ? merchantRaw : null,
    recurring: Boolean(data.recurring) && kind === "expense" && lines.length === 1,
    kind,
    allocation: kind === "income" ? allocation : null,
    lines,
  };
}

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      amount?: number;
      categoryCode?: string;
      txnDate: string;
      memo?: string | null;
      merchant?: string | null;
      recurring?: boolean;
      kind?: string;
      incomeAllocation?: string;
      lines?: { categoryCode: string; amount: number }[];
    }) => data,
  )
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) {
      throw new AppError("onboarding", "incomplete", 400);
    }
    const parsed = parseEntry(data);
    const today = zonedNow(householdTimeZone(profile.currency)).ymd;
    if (parsed.txnDate > today) throw new AppError("future_date", "future", 400);
    const receiptId = parsed.lines.length > 1 ? crypto.randomUUID() : null;
    const ids: string[] = [];
    for (const line of parsed.lines) {
      const id = crypto.randomUUID();
      ids.push(id);
      await sql`
        insert into transactions (
          id, user_id, category_code, amount, txn_date, memo, source,
          merchant, receipt_id, recurring, kind, income_allocation
        ) values (
          ${id}, ${context.userId}, ${line.categoryCode}, ${line.amount},
          ${parsed.txnDate}, ${parsed.memo}, 'user',
          ${parsed.merchant}, ${receiptId}, ${parsed.recurring}, ${parsed.kind}, ${parsed.allocation}
        )
      `;
    }
    await afterTxnChange(sql, context.userId, profile, parsed.txnDate);
    return { id: ids[0]! };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      id: string;
      amount: number;
      categoryCode: string;
      txnDate: string;
      memo?: string | null;
      merchant?: string | null;
      recurring?: boolean;
      incomeAllocation?: string | null;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) {
      throw new AppError("onboarding", "incomplete", 400);
    }
    const parsed = parseTxnInput(data);
    const today = zonedNow(householdTimeZone(profile.currency)).ymd;
    if (parsed.txnDate > today) throw new AppError("future_date", "future", 400);
    const merchantRaw = (data.merchant ?? "").trim();
    if (merchantRaw.length > 40) throw new AppError("invalid", "merchant", 400);
    const existing = await sql<{
      id: string;
      txn_date: string;
      kind: string;
      source: "user" | "system";
      merchant: string | null;
      recurring: boolean;
      income_allocation: string | null;
    }>`
      select id, txn_date, kind, source, merchant, recurring, income_allocation
      from transactions
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
      limit 1
    `;
    if (!existing[0]) throw new AppError("not_found", "missing", 404);
    const row = existing[0];
    const income = row.kind === "income";
    const allocation = income
      ? data.incomeAllocation === "savings"
        ? "savings"
        : "pool"
      : null;
    const categoryCode = income ? (allocation === "savings" ? "savings" : "other") : parsed.categoryCode;
    const merchant = data.merchant === undefined ? row.merchant : merchantRaw.length ? merchantRaw : null;
    const recurring = !income && row.source === "user" ? Boolean(data.recurring) : false;
    await sql`
      update transactions
      set category_code = ${categoryCode},
          amount = ${parsed.amount},
          txn_date = ${parsed.txnDate},
          memo = ${parsed.memo},
          merchant = ${merchant},
          recurring = ${recurring},
          income_allocation = ${allocation},
          updated_at = now()
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
    `;
    await afterTxnChange(sql, context.userId, profile, String(row.txn_date).slice(0, 10));
    await afterTxnChange(sql, context.userId, profile, parsed.txnDate);
    return { ok: true };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) {
      throw new AppError("onboarding", "incomplete", 400);
    }
    const existing = await sql<{
      id: string;
      txn_date: string;
      source: "user" | "system";
    }>`
      select id, txn_date, source from transactions
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
      limit 1
    `;
    if (!existing[0]) throw new AppError("not_found", "missing", 404);
    await sql`
      update transactions
      set deleted_at = now(), updated_at = now()
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
    `;
    if (existing[0].source === "system") {
      const periodId = profilePeriodId(profile, String(existing[0].txn_date).slice(0, 10));
      await sql`
        update monthly_budgets
        set system_txn_status = 'user_deleted'
        where user_id = ${context.userId} and year_month = ${periodId}
      `;
    } else {
      await afterTxnChange(sql, context.userId, profile, String(existing[0].txn_date).slice(0, 10));
    }
    return { ok: true };
  });

export const getTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new AppError("invalid", "profile", 400);
    const rows = await sql<{
      id: string;
      category_code: CategoryCode;
      amount: number;
      txn_date: string;
      memo: string | null;
      source: "user" | "system";
      created_at: string | Date;
      merchant: string | null;
      recurring: boolean;
      kind: string;
      income_allocation: string | null;
    }>`
      select id, category_code, amount, txn_date, memo, source, created_at,
             merchant, recurring, kind, income_allocation
      from transactions
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
      limit 1
    `;
    if (!rows[0]) throw new AppError("not_found", "missing", 404);
    const r = rows[0];
    return {
      profile: toPublic(profile),
      item: {
        id: r.id,
        categoryCode: r.category_code,
        amount: Number(r.amount),
        txnDate: String(r.txn_date).slice(0, 10),
        memo: r.memo,
        source: r.source,
        createdAt: iso(r.created_at) ?? "",
        merchant: r.merchant,
        recurring: asBool(r.recurring),
        kind: r.kind === "income" ? "income" : "expense",
        incomeAllocation:
          r.income_allocation === "savings" ? "savings" : r.income_allocation === "pool" ? "pool" : null,
        receiptId: null,
      } satisfies TxnPayload,
    };
  });

export const dismissWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { key: string; kind: string }) => data)
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const kind =
      data.kind === "cancel" || data.kind === "hike" || data.kind === "subscription" ? data.kind : null;
    const key = merchantKey(String(data.key ?? ""));
    if (!kind || key.length < 2) throw new AppError("invalid", "watch", 400);
    const sql = await getSql();
    await sql`
      insert into watch_dismissals (user_id, merchant_key, kind)
      values (${context.userId}, ${key}, ${kind})
      on conflict (user_id, merchant_key, kind) do nothing
    `;
    return { ok: true };
  });

const SEASONS = new Set<Season>(["spring", "summer", "autumn", "winter"]);

async function recentSpends(sql: Sql, userId: string, periodId: string): Promise<Record<string, number>[]> {
  const periods: Record<string, number>[] = [];
  let id = periodId;
  for (let i = 0; i < 6 && periods.length < 3; i += 1) {
    id = shiftPeriodId(id, -1);
    const spent = await spentBreakdown(sql, userId, id);
    const total = Object.values(spent.byCategory).reduce((sum, amount) => sum + amount, 0);
    if (total > 0) periods.push(spent.byCategory);
  }
  return periods;
}

export const loadSeasonPlan = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new AppError("invalid", "profile", 400);
    const today = zonedNow(householdTimeZone(profile.currency)).ymd;
    const rows = await sql<{ season: Season; category_code: CategoryCode; extra_amount: number }>`
      select season, category_code, extra_amount
      from seasonal_adjustments
      where user_id = ${context.userId}
      order by season, category_code
    `;
    return {
      season: seasonOfMonth(Number(today.slice(5, 7))),
      items: rows
        .filter((row) => row.category_code !== "savings")
        .map((row) => ({
          season: row.season,
          categoryCode: row.category_code,
          extraAmount: Number(row.extra_amount),
        })),
    };
  });

export const saveSeasonAdjustment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { season: string; categoryCode: string; extraAmount: number }) => data)
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const season = SEASONS.has(data.season as Season) ? (data.season as Season) : null;
    const category = CATEGORIES.find((item) => item.code === data.categoryCode);
    const extra = Math.trunc(Number(data.extraAmount));
    if (!season || !category || category.code === "savings") throw new AppError("invalid", "season", 400);
    if (!Number.isFinite(extra) || extra < 0 || extra > 10_000_000) throw new AppError("invalid", "amount", 400);
    const sql = await getSql();
    if (extra === 0) {
      await sql`
        delete from seasonal_adjustments
        where user_id = ${context.userId} and season = ${season} and category_code = ${category.code}
      `;
    } else {
      await sql`
        insert into seasonal_adjustments (user_id, season, category_code, extra_amount)
        values (${context.userId}, ${season}, ${category.code}, ${extra})
        on conflict (user_id, season, category_code)
        do update set extra_amount = ${extra}
      `;
    }
    return { ok: true };
  });

export const applyRecommendations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) throw new AppError("onboarding", "incomplete", 400);
    const periodId = profilePeriodId(profile);
    const budgets = await sql<BudgetRow>`
      select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
      from monthly_budgets
      where user_id = ${context.userId} and year_month = ${periodId}
      limit 1
    `;
    const budget = budgets[0];
    if (!budget) throw new AppError("invalid", "budget", 400);
    const lines = await sql<LineRow>`
      select category_code, ratio_pct, budget_amount, compressed, mandatory_override
      from monthly_budget_lines
      where monthly_budget_id = ${budget.id}
    `;
    const suggested = recommendFromHistory({
      netIncome: Number(budget.net_income_snapshot),
      lines: lines.map((line) => ({
        categoryCode: line.category_code,
        budgetAmount: Number(line.budget_amount),
      })),
      periods: await recentSpends(sql, context.userId, periodId),
    });
    if (!suggested) return { ok: false };
    for (const row of suggested) {
      if (row.locked || row.recommended === row.current) continue;
      await sql`
        update monthly_budget_lines
        set budget_amount = ${row.recommended}
        where monthly_budget_id = ${budget.id} and category_code = ${row.categoryCode}
      `;
    }
    return { ok: true };
  });

const QUICK_FALLBACK: CategoryCode[] = [
  "food",
  "dining_leisure",
  "daily",
  "transport",
  "hobby_allowance",
  "other",
];

async function quickCategories(
  sql: Sql,
  userId: string,
  locale: Locale,
  today: string,
): Promise<HomePayload["quick"]> {
  const since = addDays(today, -120);
  const rows = await sql<{ category_code: CategoryCode; amount: number }>`
    select category_code, amount
    from transactions
    where user_id = ${userId}
      and kind = 'expense'
      and source = 'user'
      and deleted_at is null
      and category_code not in ('savings', 'housing', 'insurance')
      and txn_date >= ${since}
    order by txn_date desc, created_at desc
    limit 300
  `;
  const stats = new Map<CategoryCode, { n: number; last: number }>();
  for (const row of rows) {
    const code = row.category_code;
    if (!CATEGORIES.some((item) => item.code === code)) continue;
    const current = stats.get(code) ?? { n: 0, last: 0 };
    if (current.n === 0) current.last = Number(row.amount);
    current.n += 1;
    stats.set(code, current);
  }
  const picked: CategoryCode[] = [];
  for (const [code] of [...stats.entries()].sort((a, b) => b[1].n - a[1].n)) {
    if (picked.length >= 6) break;
    picked.push(code);
  }
  for (const code of QUICK_FALLBACK) {
    if (picked.length >= 6) break;
    if (!picked.includes(code)) picked.push(code);
  }
  return picked.map((code) => ({
    categoryCode: code,
    label: categoryLabel(code, locale),
    lastAmount: stats.get(code)?.last ?? 0,
  }));
}

function tickLabel(id: string): string {
  if (/^\d{4}-\d{2}$/.test(id)) return String(Number(id.slice(5)));
  const parts = id.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export type TrendsPayload = {
  month: string;
  currentYearMonth: string;
  periodLabel: string;
  isCurrentMonth: boolean;
  currency: Currency;
  compare: HomePayload["compare"];
  periods: { id: string; label: string }[];
  categories: { categoryCode: CategoryCode; label: string; points: number[] }[];
};

export const loadTrends = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { month?: string } | undefined) => data ?? {})
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || !profile.onboarding_completed_at) throw new AppError("onboarding", "incomplete", 400);
    await ensureLifecycle(sql, context.userId, profile);
    const now = zonedNow(householdTimeZone(profile.currency));
    const currentId = profilePeriodId(profile, now.ymd);
    const ym = data?.month && isPeriodId(data.month) ? data.month : currentId;
    const ids = [5, 4, 3, 2, 1, 0].map((delta) => shiftPeriodId(ym, -delta));
    const start = boundsOf(ids[0]!).start;
    const end = boundsOf(ids[ids.length - 1]!).end;
    const rows = await sql<{ category_code: string; amount: number; txn_date: string }>`
      select category_code, amount, txn_date
      from transactions
      where user_id = ${context.userId}
        and kind = 'expense'
        and deleted_at is null
        and txn_date >= ${start}
        and txn_date <= ${end}
    `;
    const windows = ids.map((id) => ({ id, ...boundsOf(id) }));
    const byPeriod = new Map<string, Record<string, number>>(ids.map((id) => [id, {}]));
    for (const row of rows) {
      if (row.category_code === "savings") continue;
      const ymd = String(row.txn_date).slice(0, 10);
      const window = windows.find((item) => ymd >= item.start && ymd <= item.end);
      if (!window) continue;
      const bag = byPeriod.get(window.id)!;
      bag[row.category_code] = (bag[row.category_code] ?? 0) + Number(row.amount);
    }
    const periods = ids.map((id) => ({ id, byCategory: byPeriod.get(id) ?? {} }));
    const yearAgo = await spentBreakdown(sql, context.userId, shiftPeriodId(ym, -12));
    const series = buildCategoryTrends(periods);
    return {
      month: ym,
      currentYearMonth: currentId,
      periodLabel: periodLabel(ym, profile.locale),
      isCurrentMonth: ym === currentId,
      currency: profile.currency,
      compare: {
        current: livingSpend(periods[periods.length - 1]?.byCategory ?? {}),
        previous: livingSpend(periods[periods.length - 2]?.byCategory ?? {}),
        yearAgo: livingSpend(yearAgo.byCategory),
      },
      periods: ids.map((id) => ({ id, label: tickLabel(id) })),
      categories: series.map((row) => ({
        ...row,
        label: categoryLabel(row.categoryCode, profile.locale),
      })),
    } satisfies TrendsPayload;
  });

