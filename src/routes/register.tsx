import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { issueVerification } from "@/lib/server/auth-flows";
import { isEmail, normalizeEmail, passwordValid } from "@/lib/kakeibo/password";
import { captureAuthToken } from "@/lib/kakeibo/session-token";
import { AuthFrame } from "@/components/app-shell";
import { GuestOnly } from "@/components/gate";
import { LanguageToggle, useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/register")({ component: RegisterPage });

function RegisterPage() {
  return (
    <GuestOnly>
      <RegisterForm />
    </GuestOnly>
  );
}

function RegisterForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) {
      setError(t("required"));
      return;
    }
    if (!passwordValid(password)) {
      setError(t("passwordHint"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setPending(true);
    try {
      const { data, error: signError } = await authClient.signUp.email({
        email: normalized,
        password,
        name: normalized.split("@")[0] ?? "user",
      });
      if (signError) {
        setError(signError.message ?? t("saveFailed"));
        return;
      }
      captureAuthToken(data);
      const issued = await issueVerification();
      sessionStorage.setItem("kakeibo.verifyToken", issued.token);
      await navigate({ to: "/verify-email", search: {} });
    } catch {
      setError(t("saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("signUp")}</h2>
        <LanguageToggle />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Hint>{t("passwordHint")}</Hint>
        </div>
        <div>
          <Label htmlFor="confirm">{t("passwordConfirm")}</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("loading") : t("signUp")}
        </Button>
      </form>
      <div className="mt-5 text-sm">
        <Link to="/login" className="text-accent">
          {t("haveAccount")}
        </Link>
      </div>
    </AuthFrame>
  );
}
