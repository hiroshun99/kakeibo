import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { categoryAlert, monthSurplus } from "@/lib/kakeibo/alerts";
import { CATEGORIES, categoryLabel } from "@/lib/kakeibo/categories";
import { computeBudget } from "@/lib/kakeibo/budget";
import {
  compareYearMonth,
  daysInMonth,
  householdTimeZone,
  lastDayOfMonth,
  monthRange,
  zonedNow,
} from "@/lib/kakeibo/dates";
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
};

export type TxnPayload = {
  id: string;
  categoryCode: CategoryCode;
  amount: number;
  txnDate: string;
  memo: string | null;
  source: "user" | "system";
  createdAt: string;
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
  };
}

async function loadProfile(sql: Sql, userId: string): Promise<ProfileRow | null> {
  const rows = await sql<ProfileRow>`
    select id, user_id, locale, currency, net_income, household_size, housing_type,
           has_car, housing_actual, insurance_actual, onboarding_completed_at
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
  yearMonth: string,
): Promise<{
  byCategory: Record<string, number>;
  nonSavings: number;
  savingsUser: number;
}> {
  const { start, end } = monthRange(yearMonth);
  const rows = await sql<{ category_code: string; source: string; spent: number }>`
    select category_code, source, coalesce(sum(amount), 0) as spent
    from transactions
    where user_id = ${userId}
      and txn_date >= ${start}
      and txn_date <= ${end}
      and deleted_at is null
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

async function findSystemTxn(
  sql: Sql,
  userId: string,
  yearMonth: string,
): Promise<{ id: string; deleted_at: string | Date | null; amount: number } | null> {
  const { start, end } = monthRange(yearMonth);
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
  const surplus = monthSurplus({
    netIncome: Number(budget.net_income_snapshot),
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
    const lastDay = lastDayOfMonth(budget.year_month);
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
  const currentYM = now.yearMonth;

  const budgets = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId}
    order by year_month
  `;

  for (const b of budgets) {
    if (!asBool(b.closed) && compareYearMonth(b.year_month, currentYM) < 0) {
      await syncSurplus(sql, userId, b, profile.locale, true);
    }
  }

  const hasCurrent = budgets.some((b) => b.year_month === currentYM);
  if (!hasCurrent) {
    await persistBudget(sql, userId, currentYM, profile, false);
  }
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
}): Omit<ProfileInput, "currency"> & { currency?: Currency } {
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
  return {
    locale,
    currency: data.currency ? parseCurrency(data.currency) : undefined,
    netIncome,
    householdSize,
    housingType,
    hasCar: Boolean(data.hasCar),
    housingActual,
    insuranceActual,
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
          has_car, housing_actual, insurance_actual
        ) values (
          ${crypto.randomUUID()}, ${context.userId}, ${parsed.locale}, ${parsed.currency},
          ${parsed.netIncome}, ${parsed.householdSize}, ${parsed.housingType},
          ${parsed.hasCar}, ${parsed.housingActual}, ${parsed.insuranceActual}
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
            updated_at = now()
        where user_id = ${context.userId}
      `;
    }
    const profile = (await loadProfile(sql, context.userId))!;
    if (profile.onboarding_completed_at) {
      const ym = zonedNow(householdTimeZone(profile.currency)).yearMonth;
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
    const ym = zonedNow(householdTimeZone(next.currency)).yearMonth;
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
  const currentYearMonth = now.yearMonth;
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : currentYearMonth;
  const isCurrentMonth = ym === currentYearMonth;
  const [ys, ms] = ym.split("-");
  const year = Number(ys);
  const monthNum = Number(ms);
  const monthDays = daysInMonth(year, monthNum);
  const dayIndex = isCurrentMonth ? now.day : monthDays;

  const budgets = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId} and year_month = ${ym}
    limit 1
  `;
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
  const netIncome = budget ? Number(budget.net_income_snapshot) : Number(profile.net_income);
  const shortage = budget ? Number(budget.shortage) : 0;

  const categories: HomeCategory[] = CATEGORIES.map((cat) => {
    const line = lineByCode.get(cat.code);
    const budgetAmount = line ? Number(line.budget_amount) : 0;
    const spentAmt = spent.byCategory[cat.code] ?? 0;
    const alert = categoryAlert({
      budget: budgetAmount,
      spent: spentAmt,
      isCurrentMonth,
      dayIndex,
      monthDays,
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
    };
  });

  const totalSpent = Object.values(spent.byCategory).reduce((s, n) => s + n, 0);
  return {
    profile: toPublic(profile),
    currentYearMonth,
    todayYmd: now.ymd,
    month: ym,
    isCurrentMonth,
    dayIndex,
    monthDays,
    shortage,
    netIncome,
    totalSpent,
    remaining: netIncome - totalSpent,
    hasBudget: Boolean(budget),
    categories,
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
    const ym = data?.month && /^\d{4}-\d{2}$/.test(data.month) ? data.month : now.yearMonth;
    const { start, end } = monthRange(ym);
    const rows = await sql<{
      id: string;
      category_code: CategoryCode;
      amount: number;
      txn_date: string;
      memo: string | null;
      source: "user" | "system";
      created_at: string | Date;
    }>`
      select id, category_code, amount, txn_date, memo, source, created_at
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
    }));
    return {
      month: ym,
      currentYearMonth: now.yearMonth,
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
  const ym = txnDate.slice(0, 7);
  const currentYM = zonedNow(householdTimeZone(profile.currency)).yearMonth;
  if (compareYearMonth(ym, currentYM) >= 0) return;
  const budgets = await sql<BudgetRow>`
    select id, user_id, year_month, net_income_snapshot, shortage, closed, system_txn_status
    from monthly_budgets
    where user_id = ${userId} and year_month = ${ym}
    limit 1
  `;
  if (budgets[0] && asBool(budgets[0].closed)) {
    await syncSurplus(sql, userId, budgets[0], profile.locale, false);
  }
}

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: { amount: number; categoryCode: string; txnDate: string; memo?: string | null }) =>
      data,
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
    const id = crypto.randomUUID();
    await sql`
      insert into transactions (id, user_id, category_code, amount, txn_date, memo, source)
      values (
        ${id}, ${context.userId}, ${parsed.categoryCode}, ${parsed.amount},
        ${parsed.txnDate}, ${parsed.memo}, 'user'
      )
    `;
    await afterTxnChange(sql, context.userId, profile, parsed.txnDate);
    return { id };
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
    const existing = await sql<{ id: string; txn_date: string }>`
      select id, txn_date from transactions
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
      limit 1
    `;
    if (!existing[0]) throw new AppError("not_found", "missing", 404);
    await sql`
      update transactions
      set category_code = ${parsed.categoryCode},
          amount = ${parsed.amount},
          txn_date = ${parsed.txnDate},
          memo = ${parsed.memo},
          updated_at = now()
      where id = ${data.id} and user_id = ${context.userId} and deleted_at is null
    `;
    await afterTxnChange(sql, context.userId, profile, String(existing[0].txn_date).slice(0, 10));
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
      const ym = String(existing[0].txn_date).slice(0, 7);
      await sql`
        update monthly_budgets
        set system_txn_status = 'user_deleted'
        where user_id = ${context.userId} and year_month = ${ym}
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
    }>`
      select id, category_code, amount, txn_date, memo, source, created_at
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
      } satisfies TxnPayload,
    };
  });
