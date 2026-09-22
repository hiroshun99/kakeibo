import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { saveProfile } from "@/lib/server/kakeibo";
import type { Currency, HousingType } from "@/lib/kakeibo/types";
import { RequireSession } from "@/components/gate";
import { useBootstrap } from "@/components/gate";
import { Screen, Splash } from "@/components/app-shell";
import { LanguageToggle, useI18n } from "@/components/locale";
import { MoneyField } from "@/components/money-field";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  return (
    <RequireSession>
      <OnboardingForm />
    </RequireSession>
  );
}

function OnboardingForm() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const { boot, user, isPending } = useBootstrap();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [currencyLocked, setCurrencyLocked] = useState(false);
  const [netIncome, setNetIncome] = useState(0);
  const [householdSize, setHouseholdSize] = useState(1);
  const [housingType, setHousingType] = useState<HousingType>("rent");
  const [hasCar, setHasCar] = useState(true);
  const [housingActual, setHousingActual] = useState(0);
  const [insuranceActual, setInsuranceActual] = useState(0);
  const [warn, setWarn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!boot) return;
    if (!boot.emailVerified) {
      void navigate({ to: "/verify-email", search: {} });
      return;
    }
    if (boot.profile?.onboardingCompleted) {
      void navigate({ to: "/" });
      return;
    }
    if (boot.profile) {
      setLocale(boot.profile.locale);
      setCurrency(boot.profile.currency);
      setCurrencyLocked(true);
      setNetIncome(boot.profile.netIncome);
      setHouseholdSize(boot.profile.householdSize);
      setHousingType(boot.profile.housingType);
      setHasCar(boot.profile.hasCar);
      setHousingActual(boot.profile.housingActual);
      setInsuranceActual(boot.profile.insuranceActual);
    }
  }, [boot, navigate, setLocale]);

  if (isPending || !user) return <Splash />;
  if (!boot) {
    return (
      <Screen>
        <p className="text-sm font-medium text-accent">{t("appName")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("onboardingTitle")}</h1>
        <p className="mt-4 text-sm text-muted">{t("loading")}</p>
      </Screen>
    );
  }

  async function persistAndReview() {
    setPending(true);
    setError(null);
    try {
      await saveProfile({
        data: {
          locale,
          currency: currencyLocked ? undefined : currency,
          netIncome,
          householdSize,
          housingType,
          hasCar,
          housingActual,
          insuranceActual,
        },
      });
      await navigate({ to: "/review" });
    } catch {
      setError(t("saveFailed"));
    } finally {
      setPending(false);
    }
  }

  function onNext(e: FormEvent) {
    e.preventDefault();
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (netIncome <= 0) {
      setError(t("required"));
      return;
    }
    if (housingActual + insuranceActual > netIncome && !warn) {
      setWarn(true);
      return;
    }
    void persistAndReview();
  }

  return (
    <Screen>
      <p className="text-sm font-medium text-accent">{t("appName")}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("onboardingTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{step + 1} / 3</p>

      <form onSubmit={onNext} className="mt-6 space-y-5">
        {step === 0 ? (
          <>
            <div>
              <Label>{t("language")}</Label>
              <LanguageToggle />
            </div>
            <div>
              <Label htmlFor="currency">{t("currency")}</Label>
              <Select
                id="currency"
                value={currency}
                disabled={currencyLocked}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                <option value="JPY">JPY · ¥</option>
                <option value="MYR">MYR · RM</option>
              </Select>
              <Hint>{t("currencyLocked")}</Hint>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
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
          </>
        ) : null}

        {step === 2 ? (
          <>
            <MoneyField
              id="income"
              label={t("netIncome")}
              currency={currency}
              minor={netIncome}
              onMinor={setNetIncome}
              minZero={false}
            />
            <MoneyField
              id="housing-actual"
              label={t("housingActual")}
              currency={currency}
              minor={housingActual}
              onMinor={setHousingActual}
            />
            <MoneyField
              id="insurance-actual"
              label={t("insuranceActual")}
              currency={currency}
              minor={insuranceActual}
              onMinor={setInsuranceActual}
            />
            {warn ? <p className="text-sm text-danger">{t("essentialOverflow")}</p> : null}
          </>
        ) : null}

        <FieldError>{error}</FieldError>
        <div className="flex gap-3">
          {step > 0 ? (
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(step - 1)}>
              {t("back")}
            </Button>
          ) : null}
          <Button type="submit" className="flex-1" disabled={pending}>
            {step === 2 ? (warn ? t("continueAnyway") : t("next")) : t("next")}
          </Button>
        </div>
      </form>
    </Screen>
  );
}
