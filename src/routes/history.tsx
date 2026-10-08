import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadTransactions } from "@/lib/server/kakeibo";
import type { TxnPayload } from "@/lib/server/kakeibo";
import { shiftPeriodId } from "@/lib/kakeibo/periods";
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
  const [periodLabel, setPeriodLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadTransactions({ data: { month } })
      .then((payload) => {
        if (cancelled) return;
        setItems(payload.items);
        setCurrency(payload.profile.currency);
        setLocale(payload.profile.locale);
        setTitleMonth(payload.month);
        setPeriodLabel(payload.periodLabel);
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

  const title = periodLabel || t("history");

  return (
    <Screen>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg"
          onClick={() => titleMonth && setMonth(shiftPeriodId(titleMonth, -1))}
        >
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg"
          onClick={() => titleMonth && setMonth(shiftPeriodId(titleMonth, 1))}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {!items?.length ? (
        <p className="mt-10 text-center text-sm text-muted">{t("emptyPeriod")}</p>
      ) : (
        <ul className="mt-5 divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-border)]">
          {groupReceipts(items).map((group) =>
            group.length === 1 ? (
              <HistoryRow key={group[0]!.id} item={group[0]!} currency={currency} locale={locale} />
            ) : (
              <li key={group[0]!.receiptId ?? group[0]!.id} className="py-3">
                <p className="truncate text-sm font-medium">{group[0]!.merchant || t("splitReceipt")}</p>
                <p className="text-xs text-muted">{group[0]!.txnDate}</p>
                <ul className="mt-2 space-y-1">
                  {group.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                        onClick={() => navigate({ to: "/expense/$id", params: { id: item.id } })}
                      >
                        <span className="truncate text-sm text-muted">
                          {categoryLabel(item.categoryCode, locale as Locale)}
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatMoney(item.amount, currency)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-right text-xs text-muted tabular-nums">
                  {t("receiptTotal")}{" "}
                  {formatMoney(
                    group.reduce((sum, item) => sum + item.amount, 0),
                    currency,
                  )}
                </p>
              </li>
            ),
          )}
        </ul>
      )}
      <BottomNav />
    </Screen>
  );
}

function groupReceipts(items: TxnPayload[]): TxnPayload[][] {
  const order: string[] = [];
  const map = new Map<string, TxnPayload[]>();
  for (const item of items) {
    const key = item.receiptId ?? item.id;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((key) => map.get(key)!);
}

function HistoryRow({
  item,
  currency,
  locale,
}: {
  item: TxnPayload;
  currency: Currency;
  locale: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
        onClick={() => navigate({ to: "/expense/$id", params: { id: item.id } })}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {item.kind === "income" ? t("incomeBadge") : categoryLabel(item.categoryCode, locale as Locale)}
            {item.source === "system" ? (
              <span className="ml-2 rounded-full bg-bg-2 px-1.5 py-0.5 text-xs font-medium text-accent">
                {t("autoBadge")}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted">
            {item.txnDate}
            {item.merchant ? ` · ${item.merchant}` : ""}
            {item.memo ? ` · ${displayMemo(item.memo, locale)}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums">
          {item.kind === "income" ? "+" : ""}
          {formatMoney(item.amount, currency)}
        </p>
      </button>
    </li>
  );
}

function displayMemo(memo: string, locale: string): string {
  if (memo === "前月余り" || memo === "Previous month leftover") {
    return locale === "ja" ? "前月余り" : "Previous month leftover";
  }
  return memo;
}
