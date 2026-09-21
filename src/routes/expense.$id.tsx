import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { deleteTransaction, getTransaction, loadHome, updateTransaction } from "@/lib/server/kakeibo";
import { CATEGORIES, categoryLabel } from "@/lib/kakeibo/categories";
import type { CategoryCode, Currency } from "@/lib/kakeibo/types";
import { AppGate } from "@/components/gate";
import { Screen, Splash } from "@/components/app-shell";
import { MoneyField } from "@/components/money-field";
import { useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";

export const Route = createFileRoute("/expense/$id")({ component: EditExpensePage });

function EditExpensePage() {
  return (
    <AppGate>
      <EditForm />
    </AppGate>
  );
}

function EditForm() {
  const { id } = Route.useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [today, setToday] = useState("");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<CategoryCode>("food");
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([getTransaction({ data: { id } }), loadHome({ data: {} })])
      .then(([txn, home]) => {
        setCurrency(home.profile.currency);
        setToday(home.todayYmd);
        setAmount(txn.item.amount);
        setCategory(txn.item.categoryCode);
        setDate(txn.item.txnDate);
        setMemo(txn.item.memo ?? "");
        setReady(true);
      })
      .catch(() => setError(t("saveFailed")));
  }, [id, t]);

  if (!ready) return error ? <Screen><p className="text-sm text-danger">{error}</p></Screen> : <Splash />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (amount <= 0) {
      setError(t("required"));
      return;
    }
    if (date > today) {
      setError(t("futureDate"));
      return;
    }
    setPending(true);
    try {
      await updateTransaction({
        data: { id, amount, categoryCode: category, txnDate: date, memo: memo.trim() || null },
      });
      await navigate({ to: "/history" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.includes("future") ? t("futureDate") : t("saveFailed"));
      setPending(false);
    }
  }

  async function onDelete() {
    setPending(true);
    try {
      await deleteTransaction({ data: { id } });
      await navigate({ to: "/history" });
    } catch {
      setError(t("saveFailed"));
      setPending(false);
    }
  }

  return (
    <Screen>
      <h1 className="text-2xl font-semibold tracking-tight">{t("editExpense")}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <MoneyField
          id="amount"
          label={t("amount")}
          currency={currency}
          minor={amount}
          onMinor={setAmount}
          minZero={false}
        />
        <div>
          <Label htmlFor="category">{t("category")}</Label>
          <Select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryCode)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {categoryLabel(c.code, locale)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date">{t("date")}</Label>
          <Input
            id="date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="memo">{t("memo")}</Label>
          <Textarea
            id="memo"
            maxLength={100}
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 100))}
            placeholder={t("memoPlaceholder")}
          />
          <Hint>{memo.length}/100</Hint>
        </div>
        <FieldError>{error}</FieldError>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => navigate({ to: "/history" })}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? t("loading") : t("save")}
          </Button>
        </div>
        <Button type="button" variant="danger" className="w-full" disabled={pending} onClick={() => void onDelete()}>
          {t("delete")}
        </Button>
      </form>
    </Screen>
  );
}
