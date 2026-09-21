import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { consumeVerification, resendVerification } from "@/lib/server/auth-flows";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AuthFrame } from "@/components/app-shell";
import { LanguageToggle, useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    if (typeof search.token === "string" && search.token.length > 0) {
      return { token: search.token };
    }
    return {};
  },
  component: VerifyPage,
});

const tokenResults = new Map<string, Promise<"ok" | "err">>();

function consumeOnce(token: string): Promise<"ok" | "err"> {
  const existing = tokenResults.get(token);
  if (existing) return existing;
  const promise = consumeVerification({ data: { token } })
    .then(() => "ok" as const)
    .catch(() => "err" as const);
  tokenResults.set(token, promise);
  return promise;
}

function VerifyPage() {
  const { token } = Route.useSearch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "err">(
    token ? "working" : "idle",
  );
  const [hasStored, setHasStored] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    setHasStored(Boolean(sessionStorage.getItem("kakeibo.verifyToken")));
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setStatus("working");
    consumeOnce(token).then((result) => {
      if (cancelled) return;
      if (result === "ok") {
        sessionStorage.removeItem("kakeibo.verifyToken");
        setHasStored(false);
        setStatus("ok");
      } else {
        setStatus("err");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (status !== "ok") return;
    if (isPending) return;
    if (user) void navigate({ to: "/onboarding" });
  }, [status, isPending, user, navigate]);

  async function confirmStored() {
    const stored = sessionStorage.getItem("kakeibo.verifyToken");
    if (!stored) return;
    await navigate({ to: "/verify-email", search: { token: stored } });
  }

  async function resend() {
    const result = await resendVerification();
    if (result.token) {
      sessionStorage.setItem("kakeibo.verifyToken", result.token);
      setHasStored(true);
    }
    setResent(true);
  }

  return (
    <AuthFrame>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {status === "ok" ? t("verifiedTitle") : t("checkEmailTitle")}
        </h2>
        <LanguageToggle />
      </div>
      {status === "working" ? (
        <p className="text-sm text-muted">{t("verifying")}</p>
      ) : status === "ok" ? (
        <>
          <p className="text-sm text-muted">{t("verifiedBody")}</p>
          <Button
            className="mt-5 w-full"
            onClick={() => navigate({ to: user ? "/onboarding" : "/login" })}
          >
            {user ? t("continueSetup") : t("continueToLogin")}
          </Button>
        </>
      ) : status === "err" ? (
        <>
          <p className="text-sm text-danger">{t("verifyInvalid")}</p>
          {user ? (
            <Button className="mt-5 w-full" onClick={() => void resend()}>
              {t("resend")}
            </Button>
          ) : (
            <Link to="/login" className="mt-5 block text-sm text-accent">
              {t("continueToLogin")}
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{t("checkEmailBody")}</p>
          <p className="mt-3 text-sm text-fg">{t("verifyCta")}</p>
          {hasStored ? (
            <Button className="mt-5 w-full" onClick={() => void confirmStored()}>
              {t("openVerifyLink")}
            </Button>
          ) : null}
          {user ? (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => void resend()}>
              {resent ? t("resent") : t("resend")}
            </Button>
          ) : (
            <Link to="/login" className="mt-5 block text-sm text-accent">
              {t("continueToLogin")}
            </Link>
          )}
        </>
      )}
    </AuthFrame>
  );
}
