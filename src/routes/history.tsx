import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadTransactions } from "@/lib/server/kakeibo";
import type { TxnPayload } from "@/lib/server/kakeibo";
import { addMonths } from "@/lib/kakeibo/dates";
import { formatMoney } from "@/lib/kakeibo/money";
import { categoryLabel } from "@/lib/kakeibo/categories";
import type { Currency, Locale } from "@/lib/kakeibo/types";
import { AppGate } from "@/components/gate";
import { BottomNav, Screen, Splash } from "@/components/app-shell";
import { useI18n } from "@/components/locale";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  return (
    <AppGate>
      <HistoryBody />
    </AppGate>
  );
}

function HistoryBody() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<TxnPayload[] | null>(null);
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [error, setError] = useState<string | null>(null);
  const [titleMonth, setTitleMonth] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadTransactions({ data: { month } })
      .then((payload) => {
        if (cancelled) return;
        setItems(payload.items);
        setCurrency(payload.profile.currency);
        setLocale(payload.profile.locale);
        setTitleMonth(payload.month);
        if (!month) setMonth(payload.month);
      })
      .catch(() => {
        if (!cancelled) setError(t("saveFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [month, setLocale, t]);

  if (!items && !error) return <Splash />;

  const title = titleMonth
    ? new Date(`${titleMonth}-01T00:00:00`).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
        year: "numeric",
        month: "long",
      })
    : t("history");

  return (
    <Screen>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg"
          onClick={() => titleMonth && setMonth(addMonths(titleMonth, -1))}
        >
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg"
          onClick={() => titleMonth && setMonth(addMonths(titleMonth, 1))}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {!items?.length ? (
        <p className="mt-10 text-center text-sm text-muted">{t("emptyHistory")}</p>
      ) : (
        <ul className="mt-5 divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-border)]">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 py-3 text-left"
                onClick={() => navigate({ to: "/expense/$id", params: { id: item.id } })}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {categoryLabel(item.categoryCode, locale as Locale)}
                    {item.source === "system" ? (
                      <span className="ml-2 rounded-full bg-bg-2 px-1.5 py-0.5 text-xs font-medium text-accent">
                        {t("autoBadge")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {item.txnDate}
                    {item.memo ? ` · ${displayMemo(item.memo, locale)}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoney(item.amount, currency)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomNav />
    </Screen>
  );
}

function displayMemo(memo: string, locale: string): string {
  if (memo === "前月余り" || memo === "Previous month leftover") {
    return locale === "ja" ? "前月余り" : "Previous month leftover";
  }
  return memo;
}
