import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { loadHome } from "@/lib/server/kakeibo";
import type { HomePayload } from "@/lib/server/kakeibo";
import { addMonths } from "@/lib/kakeibo/dates";
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
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<HomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  }, [month, setLocale, t]);

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
  const title = new Date(`${data.month}-01T00:00:00`).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "long",
  });

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
          setMonth(addMonths(data.month, delta > 0 ? -1 : 1));
        }}
      >
        <div>
          <p className="pr-16 text-center text-sm font-medium text-accent">{t("appName")}</p>
          <div className="mt-1 flex items-center justify-between pr-16">
            <button
              type="button"
              className="grid size-11 place-items-center rounded-lg text-fg"
              onClick={() => setMonth(addMonths(data.month, -1))}
              aria-label={t("back")}
            >
              <ChevronLeft className="size-5" />
            </button>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-lg text-fg"
              onClick={() => setMonth(addMonths(data.month, 1))}
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
