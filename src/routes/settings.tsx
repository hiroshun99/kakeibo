import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { authClient } from "@/lib/auth/client";
import { getBootstrap, saveProfile, loadSeasonPlan, saveSeasonAdjustment } from "@/lib/server/kakeibo";
import type { PublicProfile } from "@/lib/server/kakeibo";
import type { CategoryCode, Currency, HousingType } from "@/lib/kakeibo/types";
import type { CycleMode } from "@/lib/kakeibo/periods";
import type { Season } from "@/lib/kakeibo/pace";
import { CATEGORIES, categoryLabel } from "@/lib/kakeibo/categories";
import { formatMoney } from "@/lib/kakeibo/money";
import { passwordValid } from "@/lib/kakeibo/password";
import { AppGate } from "@/components/gate";
import { BottomNav, Screen, Splash } from "@/components/app-shell";
import { LanguageToggle, useI18n } from "@/components/locale";
import { MoneyField } from "@/components/money-field";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <AppGate>
      <SettingsBody />
    </AppGate>
  );
}

function SettingsBody() {
  const { t, locale, setLocale } = useI18n();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [netIncome, setNetIncome] = useState(0);
  const [householdSize, setHouseholdSize] = useState(1);
  const [housingType, setHousingType] = useState<HousingType>("rent");
  const [hasCar, setHasCar] = useState(true);
  const [housingActual, setHousingActual] = useState(0);
  const [insuranceActual, setInsuranceActual] = useState(0);
  const [cycleMode, setCycleMode] = useState<CycleMode>("calendar");
  const [payday, setPayday] = useState(25);
  const [rollover, setRollover] = useState(true);
  const [savingsGoal, setSavingsGoal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    getBootstrap().then((boot) => {
      if (!boot.profile) return;
      setProfile(boot.profile);
      setLocale(boot.profile.locale);
      setNetIncome(boot.profile.netIncome);
      setHouseholdSize(boot.profile.householdSize);
      setHousingType(boot.profile.housingType);
      setHasCar(boot.profile.hasCar);
      setHousingActual(boot.profile.housingActual);
      setInsuranceActual(boot.profile.insuranceActual);
      setCycleMode(boot.profile.cycleMode);
      setPayday(boot.profile.payday);
      setRollover(boot.profile.rollover);
      setSavingsGoal(boot.profile.savingsGoal);
    });
  }, [setLocale]);

  useEffect(() => {
    if (!profile || locale === profile.locale) return;
    void saveProfile({
      data: {
        locale,
        netIncome,
        householdSize,
        housingType,
        hasCar,
        housingActual,
        insuranceActual,
        cycleMode,
        payday,
        rollover,
        savingsGoal,
      },
    }).then((result) => setProfile(result.profile));
  }, [locale]);

  if (!profile) return <Splash />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await saveProfile({
        data: {
          locale,
          netIncome,
          householdSize,
          housingType,
          hasCar,
          housingActual,
          insuranceActual,
          cycleMode,
          payday,
          rollover,
          savingsGoal,
        },
      });
      setProfile(result.profile);
      toast.success(t("saved"));
    } catch {
      setError(t("saveFailed"));
    } finally {
      setPending(false);
    }
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (!passwordValid(newPassword)) {
      setPwError(t("passwordHint"));
      return;
    }
    const { error: err } = await authClient.changePassword({
      currentPassword,
      newPassword,
    });
    if (err) {
      setPwError(t("authFailed"));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.success(t("passwordChanged"));
  }

  return (
    <Screen>
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings")}</h1>

      <section className="mt-6 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{t("language")}</p>
          <LanguageToggle />
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium">{t("currency")}</p>
          <p className="mt-1 text-sm text-muted">{profile.currency}</p>
          <Hint>{t("currencyLocked")}</Hint>
        </div>
      </section>

      <form onSubmit={onSave} className="mt-4 space-y-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-sm font-semibold">{t("household")}</p>
        <MoneyField
          id="income"
          label={t("netIncome")}
          currency={profile.currency}
          minor={netIncome}
          onMinor={setNetIncome}
          minZero={false}
        />
        <div>
          <Label htmlFor="size">{t("householdSize")}</Label>
          <Input
            id="size"
            type="number"
            min={1}
            max={20}
            value={householdSize}
            onChange={(e) => setHouseholdSize(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
        <div>
          <Label htmlFor="housing">{t("housingType")}</Label>
          <Select
            id="housing"
            value={housingType}
            onChange={(e) => setHousingType(e.target.value as HousingType)}
          >
            <option value="rent">{t("rent")}</option>
            <option value="own">{t("own")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="car">{t("hasCar")}</Label>
          <Select
            id="car"
            value={hasCar ? "yes" : "no"}
            onChange={(e) => setHasCar(e.target.value === "yes")}
          >
            <option value="yes">{t("carYes")}</option>
            <option value="no">{t("carNo")}</option>
          </Select>
        </div>
        <MoneyField
          id="housing-actual"
          label={t("housingActual")}
          currency={profile.currency}
          minor={housingActual}
          onMinor={setHousingActual}
        />
        <MoneyField
          id="insurance-actual"
          label={t("insuranceActual")}
          currency={profile.currency}
          minor={insuranceActual}
          onMinor={setInsuranceActual}
        />
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("loading") : t("save")}
        </Button>
      </form>

      <form onSubmit={onSave} className="mt-4 space-y-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-sm font-semibold">{t("cycle")}</p>
        <div>
          <Label htmlFor="cycle">{t("cycle")}</Label>
          <Select
            id="cycle"
            value={cycleMode}
            onChange={(e) => setCycleMode(e.target.value === "payday" ? "payday" : "calendar")}
          >
            <option value="calendar">{t("calendarMonth")}</option>
            <option value="payday">{t("paydayCycle")}</option>
          </Select>
        </div>
        {cycleMode === "payday" ? (
          <div>
            <Label htmlFor="payday">{t("payday")}</Label>
            <Input
              id="payday"
              type="number"
              min={1}
              max={28}
              value={payday}
              onChange={(e) => setPayday(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
            />
            <Hint>{t("paydayHint")}</Hint>
          </div>
        ) : null}
        <div>
          <Label htmlFor="rollover">{t("rollover")}</Label>
          <Select
            id="rollover"
            value={rollover ? "on" : "off"}
            onChange={(e) => setRollover(e.target.value === "on")}
          >
            <option value="on">{t("on")}</option>
            <option value="off">{t("off")}</option>
          </Select>
          <Hint>{t("rolloverHint")}</Hint>
        </div>
        <MoneyField
          id="savings-goal"
          label={t("savingsGoal")}
          currency={profile.currency}
          minor={savingsGoal}
          onMinor={setSavingsGoal}
        />
        <Hint>{t("savingsGoalHint")}</Hint>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("loading") : t("save")}
        </Button>
      </form>

      <SeasonSection currency={profile.currency} />

      <form onSubmit={onPassword} className="mt-4 space-y-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-sm font-semibold">{t("changePassword")}</p>
        <div>
          <Label htmlFor="current">{t("currentPassword")}</Label>
          <Input
            id="current"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="newpw">{t("newPassword")}</Label>
          <Input
            id="newpw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Hint>{t("passwordHint")}</Hint>
        </div>
        <FieldError>{pwError}</FieldError>
        <Button type="submit" variant="secondary" className="w-full">
          {t("changePassword")}
        </Button>
      </form>

      <section className="mt-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="mb-3 text-sm font-semibold">{t("signOut")}</p>
        <UserButton />
      </section>
      <BottomNav />
    </Screen>
  );
}

const SEASON_IDS = ["spring", "summer", "autumn", "winter"] as const;

function SeasonSection({ currency }: { currency: Currency }) {
  const { t, locale } = useI18n();
  const [season, setSeason] = useState<Season>("autumn");
  const [category, setCategory] = useState<CategoryCode>("utilities");
  const [amount, setAmount] = useState(0);
  const [items, setItems] = useState<{ season: Season; categoryCode: CategoryCode; extraAmount: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reload(resetSeason: boolean) {
    return loadSeasonPlan().then((plan) => {
      if (resetSeason) setSeason(plan.season);
      setItems(plan.items);
    });
  }

  useEffect(() => {
    void reload(true).catch(() => setError(t("saveFailed")));
  }, [t]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (amount <= 0) {
      setError(t("required"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveSeasonAdjustment({ data: { season, categoryCode: category, extraAmount: amount } });
      setAmount(0);
      await reload(false);
      toast.success(t("saved"));
    } catch {
      setError(t("saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onAdd} className="mt-4 space-y-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-sm font-semibold">{t("seasonBudget")}</p>
      <Hint>{t("seasonHint")}</Hint>
      <div>
        <Label htmlFor="season">{t("seasonBudget")}</Label>
        <Select id="season" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
          {SEASON_IDS.map((id) => (
            <option key={id} value={id}>
              {t(id)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="season-category">{t("category")}</Label>
        <Select
          id="season-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryCode)}
        >
          {CATEGORIES.filter((item) => item.code !== "savings").map((item) => (
            <option key={item.code} value={item.code}>
              {categoryLabel(item.code, locale)}
            </option>
          ))}
        </Select>
      </div>
      <MoneyField
        id="season-amount"
        label={t("amount")}
        currency={currency}
        minor={amount}
        onMinor={setAmount}
      />
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.season}-${item.categoryCode}`} className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm">
                {t(item.season)} · {categoryLabel(item.categoryCode, locale)}
                <span className="ml-2 tabular-nums">+{formatMoney(item.extraAmount, currency)}</span>
              </p>
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-xs font-medium text-accent"
                onClick={() => {
                  void saveSeasonAdjustment({
                    data: { season: item.season, categoryCode: item.categoryCode, extraAmount: 0 },
                  }).then(() => reload(false));
                }}
              >
                {t("removeLine")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("loading") : t("addSeason")}
      </Button>
    </form>
  );
}
