import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadTrends } from "@/lib/server/kakeibo";
import type { TrendsPayload } from "@/lib/server/kakeibo";
import { percentChange } from "@/lib/kakeibo/insights";
import { shiftPeriodId } from "@/lib/kakeibo/periods";
import { formatMoney } from "@/lib/kakeibo/money";
import type { Currency } from "@/lib/kakeibo/types";
import { AppGate } from "@/components/gate";
import { BottomNav, Screen, Splash } from "@/components/app-shell";
import { useI18n } from "@/components/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trends")({
  beforeLoad: ({ context }) => {
    const session = (context as { sessionUser?: { id: string } | null }).sessionUser;
    if (!session) throw redirect({ to: "/login" });
  },
  component: TrendsPage,
});

function TrendsPage() {
  return (
    <AppGate>
      <TrendsBody />
    </AppGate>
  );
}

function TrendsBody() {
  const { t } = useI18n();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<TrendsPayload | null>(null);
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadTrends({ data: { month } })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setCurrency(payload.currency);
        if (!month) setMonth(payload.month);
      })
      .catch(() => {
        if (!cancelled) setError(t("saveFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [month, t]);

  if (!data && !error) return <Splash />;
  if (!data) {
    return (
      <Screen>
        <p className="text-sm text-danger">{error}</p>
        <BottomNav />
      </Screen>
    );
  }

  return (
    <Screen>
      <div>
        <p className="pr-16 text-center text-sm font-medium text-accent">{t("trends")}</p>
        <div className="mt-1 flex items-center justify-between pr-16">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-fg"
            onClick={() => setMonth(shiftPeriodId(data.month, -1))}
            aria-label={t("back")}
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="text-lg font-semibold tracking-tight">{data.periodLabel}</h1>
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
      <p className="mt-3 text-xs text-muted">{t("trendsHint")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CompareCard label={t("mom")} current={data.compare.current} baseline={data.compare.previous} currency={currency} />
        <CompareCard label={t("yoy")} current={data.compare.current} baseline={data.compare.yearAgo} currency={currency} />
      </div>
      {data.categories.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">{t("emptyPeriod")}</p>
      ) : (
        <div className="mt-4 rounded-xl bg-surface px-4 shadow-[var(--shadow-border)]">
          {data.categories.map((row) => (
            <TrendRow key={row.categoryCode} row={row} labels={data.periods.map((period) => period.label)} currency={currency} />
          ))}
        </div>
      )}
      <BottomNav />
    </Screen>
  );
}

function CompareCard({
  label,
  current,
  baseline,
  currency,
}: {
  label: string;
  current: number;
  baseline: number;
  currency: Currency;
}) {
  const { t } = useI18n();
  const delta = current - baseline;
  const pct = percentChange(current, baseline);
  const text =
    delta === 0
      ? t("sameSpend")
      : `${delta > 0 ? "+" : ""}${formatMoney(delta, currency, { signed: delta < 0 })}${
          pct == null ? "" : ` · ${pct > 0 ? "+" : ""}${pct}%`
        }`;
  return (
    <div className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold tabular-nums",
          delta > 0 ? "text-danger" : delta < 0 ? "text-accent" : "text-fg",
        )}
      >
        {text}
      </p>
    </div>
  );
}

function TrendRow({
  row,
  labels,
  currency,
}: {
  row: TrendsPayload["categories"][number];
  labels: string[];
  currency: Currency;
}) {
  const latest = row.points[row.points.length - 1] ?? 0;
  const previous = row.points[row.points.length - 2] ?? 0;
  const pct = percentChange(latest, previous);
  const max = Math.max(...row.points, 1);
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{row.label}</p>
        <p className="shrink-0 text-sm font-medium tabular-nums">
          {formatMoney(latest, currency)}
          {pct != null && latest !== previous ? (
            <span className={pct > 0 ? "text-danger" : "text-accent"}>{` ${pct > 0 ? "+" : ""}${pct}%`}</span>
          ) : null}
        </p>
      </div>
      <div className="mt-2 flex h-14 items-end gap-1">
        {row.points.map((amount, index) => (
          <div key={`${row.categoryCode}-${index}`} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={cn(
                "w-full rounded-sm",
                index === row.points.length - 1 ? "bg-accent" : "bg-accent/35",
              )}
              style={{ height: amount <= 0 ? 0 : `${Math.max(8, Math.round((amount / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="flex-1 text-center text-[10px] text-muted tabular-nums">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
