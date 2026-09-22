import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeOnboarding, previewBudget } from "@/lib/server/kakeibo";
import { formatMoney } from "@/lib/kakeibo/money";
import { RequireSession, useBootstrap } from "@/components/gate";
import { Screen, Splash } from "@/components/app-shell";
import { useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({ component: ReviewPage });

function ReviewPage() {
  return (
    <RequireSession>
      <ReviewBody />
    </RequireSession>
  );
}

function ReviewBody() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { boot, isPending } = useBootstrap();
  const [data, setData] = useState<Awaited<ReturnType<typeof previewBudget>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!boot) return;
    if (!boot.emailVerified) {
      void navigate({ to: "/verify-email", search: {} });
      return;
    }
    if (!boot.profile) {
      void navigate({ to: "/onboarding" });
      return;
    }
    previewBudget()
      .then(setData)
      .catch(() => setError(t("saveFailed")));
  }, [boot, navigate, t]);

  if (isPending || !data) {
    return error ? (
      <Screen>
        <p className="text-sm text-danger">{error}</p>
      </Screen>
    ) : (
      <Splash />
    );
  }

  const currency = data.profile.currency;

  async function goHome() {
    setPending(true);
    try {
      await completeOnboarding();
      await navigate({ to: "/" });
    } catch {
      setError(t("saveFailed"));
      setPending(false);
    }
  }

  return (
    <Screen>
      <p className="text-sm font-medium text-accent">{t("appName")}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("budgetReview")}</h1>
      {data.shortage > 0 ? (
        <div className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t("shortageBanner")} · {formatMoney(data.shortage, currency)}
        </div>
      ) : null}
      <ul className="mt-5 divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-border)]">
        {data.lines.map((line) => (
          <li key={line.categoryCode} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{line.label}</p>
              <p className="text-xs text-muted">
                {line.ratioPct}%
                {line.mandatoryOverride ? ` · ${t("override")}` : ""}
                {line.compressed ? (
                  <span className="ml-1 rounded-full bg-bg-2 px-1.5 py-0.5 text-xs font-medium text-accent">
                    {t("adjusted")}
                  </span>
                ) : null}
              </p>
            </div>
            <p className={cn("tabular-nums text-sm font-medium", line.compressed && "text-accent")}>
              {formatMoney(line.budgetAmount, currency)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => navigate({ to: "/onboarding" })}>
          {t("back")}
        </Button>
        <Button className="flex-1" disabled={pending} onClick={() => void goHome()}>
          {pending ? t("loading") : t("goHome")}
        </Button>
      </div>
    </Screen>
  );
}
