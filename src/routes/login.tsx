import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { prepareLogin, recordLoginAttempt } from "@/lib/server/auth-flows";
import { isEmail, normalizeEmail, passwordValid } from "@/lib/kakeibo/password";
import { captureAuthToken } from "@/lib/kakeibo/session-token";
import { AuthFrame } from "@/components/app-shell";
import { GuestOnly } from "@/components/gate";
import { LanguageToggle, useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  return (
    <GuestOnly>
      <LoginForm />
    </GuestOnly>
  );
}

function LoginForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized) || !passwordValid(password)) {
      setError(t("authFailed"));
      return;
    }
    setPending(true);
    try {
      const prep = await prepareLogin({ data: { email: normalized } });
      if (!prep.allowed) {
        setError(t("authFailed"));
        return;
      }
      const { data, error: signError } = await authClient.signIn.email({
        email: normalized,
        password,
      });
      await recordLoginAttempt({ data: { email: normalized, success: !signError } });
      if (signError) {
        setError(t("authFailed"));
        return;
      }
      captureAuthToken(data);
      window.location.href = "/";
    } catch {
      setError(t("authFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("signIn")}</h2>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("loading") : t("signIn")}
        </Button>
      </form>
      <div className="mt-5 flex flex-col gap-2 text-sm">
        <Link to="/forgot-password" className="text-accent">
          {t("forgotPassword")}
        </Link>
        <Link to="/register" className="text-muted">
          {t("noAccount")}
        </Link>
      </div>
    </AuthFrame>
  );
}
