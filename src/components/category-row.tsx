import { formatMoney } from "@/lib/kakeibo/money";
import type { Currency } from "@/lib/kakeibo/types";
import type { HomeCategory } from "@/lib/server/kakeibo";
import { useI18n } from "./locale";
import { cn } from "@/lib/utils";

export function CategoryRow({
  row,
  currency,
}: {
  row: HomeCategory;
  currency: Currency;
}) {
  const { t } = useI18n();
  const pct = row.budgetAmount > 0 ? Math.min(999, (row.spent / row.budgetAmount) * 100) : row.spent > 0 ? 100 : 0;
  const width = Math.min(100, pct);
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-medium", row.red ? "text-danger" : "text-fg")}>
            {row.label}
            {row.compressed ? (
              <span className="ml-1.5 align-middle text-xs font-medium text-accent"> {t("adjusted")}</span>
            ) : null}
          </p>
          <p className="text-xs text-muted tabular-nums">
            {t("spent")} {formatMoney(row.spent, currency)} / {formatMoney(row.budgetAmount, currency)}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 text-sm font-medium tabular-nums",
            row.red ? "text-danger" : "text-fg",
          )}
        >
          {formatMoney(row.remaining, currency, { signed: row.remaining < 0 })}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-2">
        <div
          className={cn("h-full rounded-full", row.red ? "bg-danger" : "bg-accent")}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
