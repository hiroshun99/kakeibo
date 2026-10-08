import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { createTransaction, loadHome } from "@/lib/server/kakeibo";
import { CATEGORIES, categoryLabel } from "@/lib/kakeibo/categories";
import { presetCategories, SPLIT_PRESET_IDS, type SplitPresetId } from "@/lib/kakeibo/splits";
import { formatMoney } from "@/lib/kakeibo/money";
import type { CategoryCode, Currency } from "@/lib/kakeibo/types";
import { AppGate } from "@/components/gate";
import { Screen, Splash } from "@/components/app-shell";
import { MoneyField } from "@/components/money-field";
import { useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";

export const Route = createFileRoute("/expense")({ component: NewExpensePage });

function NewExpensePage() {
  return (
    <AppGate>
      <ExpenseForm />
    </AppGate>
  );
}

type Mode = "expense" | "income";
type Preset = "single" | SplitPresetId;

function ExpenseForm() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [today, setToday] = useState("");
  const [mode, setMode] = useState<Mode>("expense");
  const [preset, setPreset] = useState<Preset>("single");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<CategoryCode>("food");
  const [splits, setSplits] = useState<{ code: CategoryCode; amount: number }[]>([]);
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [merchant, setMerchant] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [allocation, setAllocation] = useState<"pool" | "savings">("pool");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadHome({ data: {} })
      .then((home) => {
        setCurrency(home.profile.currency);
        setToday(home.todayYmd);
        setDate(home.todayYmd);
        setReady(true);
      })
      .catch(() => setError(t("saveFailed")));
  }, [t]);

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next === "single") {
      setSplits([]);
      return;
    }
    setSplits(presetCategories(next).map((code) => ({ code, amount: 0 })));
    if (!merchant.trim()) setMerchant(t(next));
  }

  function addLine() {
    const used = new Set(splits.map((line) => line.code));
    const next =
      CATEGORIES.find((c) => !used.has(c.code) && c.code !== "savings" && c.code !== "housing")?.code ??
      "other";
    setSplits((current) => [...current, { code: next, amount: 0 }]);
  }

  if (!ready) return error ? <Screen><p className="text-sm text-danger">{error}</p></Screen> : <Splash />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (date > today) {
      setError(t("futureDate"));
      return;
    }
    const lines =
      mode === "expense" && preset !== "single"
        ? splits.filter((line) => line.amount > 0)
        : [];
    if (mode === "expense" && preset !== "single" && lines.length === 0) {
      setError(t("required"));
      return;
    }
    if ((mode === "income" || preset === "single") && amount <= 0) {
      setError(t("required"));
      return;
    }
    setPending(true);
    try {
      await createTransaction({
        data:
          mode === "income"
            ? {
                kind: "income",
                amount,
                txnDate: date,
                memo: memo.trim() || null,
                merchant: merchant.trim() || null,
                incomeAllocation: allocation,
              }
            : preset === "single"
              ? {
                  amount,
                  categoryCode: category,
                  txnDate: date,
                  memo: memo.trim() || null,
                  merchant: merchant.trim() || null,
                  recurring,
                }
              : {
                  txnDate: date,
                  memo: memo.trim() || null,
                  merchant: merchant.trim() || null,
                  lines: lines.map((line) => ({ categoryCode: line.code, amount: line.amount })),
                },
      });
      await navigate({ to: "/" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message === "future" || message.includes("future") ? t("futureDate") : t("saveFailed"));
      setPending(false);
    }
  }

  return (
    <Screen>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "income" ? t("incomeTitle") : t("recordExpense")}
      </h1>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-bg-2 p-1">
        {(["expense", "income"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={
              mode === item
                ? "min-h-11 rounded-md bg-surface text-sm font-medium text-fg"
                : "min-h-11 rounded-md text-sm font-medium text-muted"
            }
            onClick={() => setMode(item)}
          >
            {item === "expense" ? t("expenseTab") : t("incomeTab")}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "expense" ? (
          <div>
            <Label>{t("splitReceipt")}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <PresetChip active={preset === "single"} onClick={() => choosePreset("single")}>
                {t("oneCategory")}
              </PresetChip>
              {SPLIT_PRESET_IDS.map((id) => (
                <PresetChip key={id} active={preset === id} onClick={() => choosePreset(id)}>
                  {t(id)}
                </PresetChip>
              ))}
            </div>
            {preset !== "single" ? <Hint>{t("splitHint")}</Hint> : null}
          </div>
        ) : null}

        {mode === "income" || preset === "single" ? (
          <MoneyField
            id="amount"
            label={t("amount")}
            currency={currency}
            minor={amount}
            onMinor={setAmount}
            minZero={false}
          />
        ) : (
          <div className="space-y-3">
            {splits.map((line, index) => (
              <div key={`${line.code}-${index}`} className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label htmlFor={`split-cat-${index}`}>{t("category")}</Label>
                  {splits.length > 1 ? (
                    <button
                      type="button"
                      className="min-h-11 px-2 text-xs font-medium text-muted"
                      onClick={() => setSplits((current) => current.filter((_, i) => i !== index))}
                    >
                      {t("removeLine")}
                    </button>
                  ) : null}
                </div>
                <Select
                  id={`split-cat-${index}`}
                  value={line.code}
                  onChange={(e) =>
                    setSplits((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, code: e.target.value as CategoryCode } : row,
                      ),
                    )
                  }
                >
                  {CATEGORIES.filter((c) => c.code !== "savings").map((c) => (
                    <option key={c.code} value={c.code}>
                      {categoryLabel(c.code, locale)}
                    </option>
                  ))}
                </Select>
                <div className="mt-3">
                  <MoneyField
                    id={`split-${index}`}
                    label={t("amount")}
                    currency={currency}
                    minor={line.amount}
                    onMinor={(value) =>
                      setSplits((current) =>
                        current.map((row, i) => (i === index ? { ...row, amount: value } : row)),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              {splits.length < 6 ? (
                <button type="button" className="min-h-11 text-sm font-medium text-accent" onClick={addLine}>
                  {t("addLine")}
                </button>
              ) : (
                <span />
              )}
              <p className="text-sm font-semibold tabular-nums">
                {t("receiptTotal")} {formatMoney(splits.reduce((sum, line) => sum + line.amount, 0), currency)}
              </p>
            </div>
          </div>
        )}

        {mode === "expense" && preset === "single" ? (
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
        ) : null}

        {mode === "income" ? (
          <div>
            <Label htmlFor="allocation">{t("incomeTab")}</Label>
            <Select
              id="allocation"
              value={allocation}
              onChange={(e) => setAllocation(e.target.value === "savings" ? "savings" : "pool")}
            >
              <option value="pool">{t("allocatePool")}</option>
              <option value="savings">{t("allocateSavings")}</option>
            </Select>
          </div>
        ) : null}

        <div>
          <Label htmlFor="merchant">{t("merchant")}</Label>
          <Input
            id="merchant"
            maxLength={40}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value.slice(0, 40))}
            placeholder={t("merchantPlaceholder")}
          />
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
        {mode === "expense" && preset === "single" ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            {t("recurring")}
          </label>
        ) : null}
        <FieldError>{error}</FieldError>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => navigate({ to: "/" })}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? t("loading") : t("save")}
          </Button>
        </div>
      </form>
    </Screen>
  );
}

function PresetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-11 rounded-full bg-accent px-3 text-sm font-medium text-accent-fg"
          : "min-h-11 rounded-full bg-bg-2 px-3 text-sm font-medium text-fg"
      }
    >
      {children}
    </button>
  );
}
