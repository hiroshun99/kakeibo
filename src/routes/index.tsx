import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { applyRecommendations, createTransaction, dismissWatch, loadHome } from "@/lib/server/kakeibo";
import type { HomePayload } from "@/lib/server/kakeibo";
import { shiftPeriodId } from "@/lib/kakeibo/periods";
import { shortDate } from "@/lib/kakeibo/pace";
import { percentChange, quickAmounts } from "@/lib/kakeibo/insights";
import { formatMoney } from "@/lib/kakeibo/money";
import type { CategoryCode, Currency } from "@/lib/kakeibo/types";
import { AppGate } from "@/components/gate";
import { BottomNav, Screen, Splash } from "@/components/app-shell";
import { CategoryRow } from "@/components/category-row";
import { MoneyField } from "@/components/money-field";
import { useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    const session = (context as { sessionUser?: { id: string } | null }).sessionUser;
    if (!session) throw redirect({ to: "/login" });
  },
  component: HomePage,
});

function HomePage() {
  return (
    <AppGate>
      <HomeBody />
    </AppGate>
  );
}

function HomeBody() {
  const { t, tf, setLocale, locale } = useI18n();
  const navigate = useNavigate();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<HomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadHome({ data: { month } })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLocale(payload.profile.locale);
        if (!month) setMonth(payload.month);
      })
      .catch(() => {
        if (!cancelled) setError(t("saveFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [month, reloadKey, setLocale, t]);

  if (!data && !error) return <Splash />;
  if (!data) {
    return (
      <Screen>
        <p className="text-sm text-danger">{error}</p>
        <BottomNav />
      </Screen>
    );
  }

  const currency = data.profile.currency;
  const title = data.periodLabel;

  return (
    <Screen>
      <div
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null) return;
          const delta = end - start;
          if (Math.abs(delta) < 60) return;
          setMonth(shiftPeriodId(data.month, delta > 0 ? -1 : 1));
        }}
      >
        <div>
          <p className="pr-16 text-center text-sm font-medium text-accent">{t("appName")}</p>
          <div className="mt-1 flex items-center justify-between pr-16">
            <button
              type="button"
              className="grid size-11 place-items-center rounded-lg text-fg"
              onClick={() => setMonth(shiftPeriodId(data.month, -1))}
              aria-label={t("back")}
            >
              <ChevronLeft className="size-5" />
            </button>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-lg text-fg"
              onClick={() => setMonth(shiftPeriodId(data.month, 1))}
              aria-label={t("next")}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        {data.isCurrentMonth && data.quick.length > 0 ? (
          <QuickAdd
            categories={data.quick}
            currency={currency}
            today={data.todayYmd}
            onSaved={() => setReloadKey((n) => n + 1)}
          />
        ) : null}

        {data.shortage > 0 ? (
          <div className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {t("shortageBanner")}
          </div>
        ) : null}

        {data.pace ? (
          <div className="mt-4 rounded-xl bg-accent px-4 py-4 text-accent-fg">
            <p className="text-xs font-medium text-accent-fg/80">{t("todayAllowance")}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatMoney(data.pace.todayAllowance, currency)}
            </p>
            <p className="mt-2 text-sm tabular-nums">
              {t("untilPayday")} {formatMoney(data.pace.untilPayday, currency)}
              <span className="text-accent-fg/80"> · {shortDate(data.pace.paydayDate, locale)}</span>
            </p>
            <p className="mt-2 text-xs text-accent-fg/80">{t("paceHint")}</p>
          </div>
        ) : null}

        {data.pace?.alreadyShort ? (
          <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t("shortfallNow")}</div>
        ) : data.pace?.shortfallDate ? (
          <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {tf("shortfall", { date: shortDate(data.pace.shortfallDate, locale) })}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label={t("income")} value={formatMoney(data.netIncome, currency)} />
          <Stat label={t("totalSpent")} value={formatMoney(data.totalSpent, currency)} />
          <Stat
            label={t("leftover")}
            value={formatMoney(data.remaining, currency, { signed: data.remaining < 0 })}
            danger={data.remaining < 0}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat {...compareStat(data.compare.current, data.compare.previous, currency, t)} label={t("mom")} />
          <Stat {...compareStat(data.compare.current, data.compare.yearAgo, currency, t)} label={t("yoy")} />
        </div>
        <p className="mt-2 text-center text-xs text-muted">{t("compareHint")}</p>
        <Link
          to="/trends"
          className="mt-3 flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-accent"
        >
          {t("trends")}
        </Link>
        {data.extraIncome > 0 ? (
          <p className="mt-2 text-center text-xs text-muted tabular-nums">
            {t("extraIncome")} +{formatMoney(data.extraIncome, currency)}
          </p>
        ) : null}

        {data.week ? (
          <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">{t("weekBudget")}</p>
              <p className="text-xs text-muted tabular-nums">{data.week.range}</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <WeekStat label={t("budget")} value={formatMoney(data.week.budget, currency)} />
              <WeekStat label={t("spent")} value={formatMoney(data.week.spent, currency)} />
              <WeekStat
                label={t("leftover")}
                value={formatMoney(data.week.remaining, currency, { signed: data.week.remaining < 0 })}
                danger={data.week.remaining < 0}
              />
            </div>
            <p className="mt-2 text-xs text-muted">{t("weekHint")}</p>
          </div>
        ) : null}

        {data.isCurrentMonth ? (
          data.savingsForecast ? (
            <ForecastCard forecast={data.savingsForecast} currency={currency} />
          ) : (
            <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
              <p className="text-sm font-semibold">{t("forecastTitle")}</p>
              <p className="mt-1 text-xs text-muted">{t("forecastNeedGoal")}</p>
              <Link to="/settings" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent">
                {t("setGoal")}
              </Link>
            </div>
          )
        ) : null}

        <WatchList
          title={t("priceHike")}
          kind="hike"
          items={data.hikes}
          currency={currency}
          onDismiss={() => setReloadKey((n) => n + 1)}
        />
        <WatchList
          title={t("cancelCandidate")}
          kind="cancel"
          items={data.cancels}
          currency={currency}
          hint={t("cancelHint")}
          onDismiss={() => setReloadKey((n) => n + 1)}
        />

        {data.subscriptions.length > 0 ? (
          <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
            <p className="text-sm font-semibold">{t("subscriptions")}</p>
            <p className="mt-1 text-xs text-muted">{t("subscriptionHint")}</p>
            <ul className="mt-2 space-y-3">
              {data.subscriptions.map((item) => (
                <li key={item.key} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {formatMoney(item.amount, currency)}
                      {t("perMonth")} · {tf("subscriptionMonths", { n: item.months })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 shrink-0 px-2 text-xs font-medium text-accent"
                    onClick={() => {
                      void dismissWatch({ data: { key: item.key, kind: "subscription" } }).then(() =>
                        setReloadKey((n) => n + 1),
                      );
                    }}
                  >
                    {t("dismiss")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button className="mt-5 w-full" variant="secondary" onClick={() => navigate({ to: "/expense" })}>
          <Plus className="size-4" />
          {t("detailExpense")}
        </Button>

        {data.recommendations ? (
          <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
            <p className="text-sm font-semibold">{t("recommendTitle")}</p>
            <p className="mt-1 text-xs text-muted">{t("recommendHint")}</p>
            <ul className="mt-3 space-y-2">
              {data.recommendations.map((row) => (
                <li key={row.categoryCode} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {row.label}
                    {row.locked ? <span className="ml-1 text-xs text-muted">{t("savingsKept")}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {row.locked
                      ? formatMoney(row.recommended, currency)
                      : `${formatMoney(row.current, currency)} → ${formatMoney(row.recommended, currency)}`}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              onClick={() => {
                void applyRecommendations().then(() => setReloadKey((n) => n + 1));
              }}
            >
              {t("applyRecommend")}
            </Button>
          </div>
        ) : null}

        {data.categories.some((row) => row.seasonal > 0) ? (
          <p className="mt-5 text-xs text-muted">
            {t(data.season)} · {t("seasonOn")}
          </p>
        ) : null}

        <div className={`${data.categories.some((row) => row.seasonal > 0) ? "mt-2" : "mt-5"} rounded-xl bg-surface px-4 shadow-[var(--shadow-border)]`}>
          {data.categories.map((row) => (
            <CategoryRow key={row.categoryCode} row={row} currency={currency} />
          ))}
        </div>
      </div>
      <BottomNav />
    </Screen>
  );
}

function WatchList({
  title,
  kind,
  items,
  currency,
  hint,
  onDismiss,
}: {
  title: string;
  kind: "hike" | "cancel";
  items: HomePayload["hikes"];
  currency: HomePayload["profile"]["currency"];
  hint?: string;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 space-y-3">
        {items.map((item) => (
          <li key={`${kind}-${item.key}`} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted tabular-nums">
                {kind === "hike"
                  ? `${formatMoney(item.previous, currency)} → ${formatMoney(item.latest, currency)}`
                  : hint}
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 shrink-0 px-2 text-xs font-medium text-accent"
              onClick={() => {
                void dismissWatch({ data: { key: item.key, kind } }).then(onDismiss);
              }}
            >
              {t("dismiss")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${danger ? "text-danger" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
  good,
}: {
  label: string;
  value: string;
  danger?: boolean;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold tabular-nums",
          danger ? "text-danger" : good ? "text-accent" : "text-fg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function signedMoney(amount: number, currency: Currency): string {
  if (amount > 0) return `+${formatMoney(amount, currency)}`;
  return formatMoney(amount, currency, { signed: true });
}

function compareStat(
  current: number,
  baseline: number,
  currency: Currency,
  translate: (key: "sameSpend") => string,
): { value: string; danger?: boolean; good?: boolean } {
  const delta = current - baseline;
  if (delta === 0) return { value: translate("sameSpend") };
  const pct = percentChange(current, baseline);
  const pctText = pct == null ? "" : ` · ${pct > 0 ? "+" : ""}${pct}%`;
  return {
    value: `${signedMoney(delta, currency)}${pctText}`,
    danger: delta > 0,
    good: delta < 0,
  };
}

function yearDate(ymd: string, locale: "ja" | "en"): string {
  const [year, month, day] = ymd.split("-").map(Number);
  if (locale === "ja") return `${year}年${month}月${day}日`;
  return `${month}/${day}/${year}`;
}

function ForecastCard({
  forecast,
  currency,
}: {
  forecast: NonNullable<HomePayload["savingsForecast"]>;
  currency: Currency;
}) {
  const { t, tf, locale } = useI18n();
  return (
    <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="text-sm font-semibold">{t("forecastTitle")}</p>
      {forecast.achieved ? (
        <p className="mt-2 text-lg font-semibold">{t("forecastAchieved")}</p>
      ) : forecast.etaYmd ? (
        <p className="mt-2 text-lg font-semibold">{tf("forecastWhen", { date: yearDate(forecast.etaYmd, locale) })}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">{t("forecastNoPace")}</p>
      )}
      <p className="mt-2 text-xs text-muted tabular-nums">
        {t("forecastSaved")} {formatMoney(forecast.saved, currency)} / {formatMoney(forecast.goal, currency)}
      </p>
      <p className="mt-1 text-xs text-muted tabular-nums">
        {t("forecastPace")} {formatMoney(forecast.monthlyPace, currency)}
        {forecast.monthsLeft != null && !forecast.achieved
          ? ` · ${tf("forecastMonths", { n: forecast.monthsLeft })}`
          : ""}
      </p>
    </div>
  );
}

function QuickAdd({
  categories,
  currency,
  today,
  onSaved,
}: {
  categories: HomePayload["quick"];
  currency: Currency;
  today: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState<CategoryCode | null>(null);
  const [custom, setCustom] = useState(0);
  const [pending, setPending] = useState(false);
  const selected = categories.find((item) => item.categoryCode === code) ?? null;
  const amounts = selected ? quickAmounts(currency, selected.lastAmount) : [];

  async function save(amount: number) {
    if (!code || amount <= 0 || pending) return;
    setPending(true);
    try {
      await createTransaction({
        data: { amount, categoryCode: code, txnDate: today, memo: null, merchant: null },
      });
      toast.success(t("recorded"));
      setCode(null);
      setCustom(0);
      onSaved();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="text-sm font-semibold">{t("quickAdd")}</p>
      <p className="mt-1 text-xs text-muted">{t("quickHint")}</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => {
          const active = category.categoryCode === code;
          return (
            <button
              key={category.categoryCode}
              type="button"
              disabled={pending}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-3 text-sm font-medium",
                active ? "bg-accent text-accent-fg" : "bg-bg text-fg",
              )}
              onClick={() => {
                setCustom(0);
                setCode(active ? null : category.categoryCode);
              }}
            >
              {category.label}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {amounts.map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={pending}
                className="min-h-11 rounded-lg bg-bg px-3 text-sm font-medium tabular-nums"
                onClick={() => void save(amount)}
              >
                {amount === selected.lastAmount && selected.lastAmount > 0 ? `${t("quickLast")} ` : ""}
                {formatMoney(amount, currency)}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <MoneyField
                id="quick-amount"
                label={t("amount")}
                currency={currency}
                minor={custom}
                onMinor={setCustom}
              />
            </div>
            <Button disabled={pending || custom <= 0} onClick={() => void save(custom)}>
              {t("record")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
