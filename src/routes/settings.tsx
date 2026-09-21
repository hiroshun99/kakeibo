import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { authClient } from "@/lib/auth/client";
import { getBootstrap, saveProfile } from "@/lib/server/kakeibo";
import type { PublicProfile } from "@/lib/server/kakeibo";
import type { HousingType } from "@/lib/kakeibo/types";
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
