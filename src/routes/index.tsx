import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { loadHome, dismissWatch } from "@/lib/server/kakeibo";
import type { HomePayload } from "@/lib/server/kakeibo";
import { shiftPeriodId } from "@/lib/kakeibo/periods";
import { formatMoney } from "@/lib/kakeibo/money";
import { AppGate } from "@/components/gate";
import { BottomNav, Screen, Splash } from "@/components/app-shell";
import { CategoryRow } from "@/components/category-row";
import { useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";

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
  const { t, setLocale } = useI18n();
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

        {data.shortage > 0 ? (
          <div className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {t("shortageBanner")}
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

        <Button className="mt-5 w-full" onClick={() => navigate({ to: "/expense" })}>
          <Plus className="size-4" />
          {t("recordExpense")}
        </Button>

        <div className="mt-5 rounded-xl bg-surface px-4 shadow-[var(--shadow-border)]">
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
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${danger ? "text-danger" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}
