import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { requestPasswordReset } from "@/lib/server/auth-flows";
import { normalizeEmail } from "@/lib/kakeibo/password";
import { AuthFrame } from "@/components/app-shell";
import { LanguageToggle, useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPage });

function ForgotPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const result = await requestPasswordReset({ data: { email: normalizeEmail(email) } });
      setToken(result.token);
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("forgotPassword")}</h2>
        <LanguageToggle />
      </div>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("resetSent")}</p>
          {token ? (
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/reset-password", search: { token } })}
            >
              {t("openResetLink")}
            </Button>
          ) : null}
          <Link to="/login" className="block text-sm text-accent">
            {t("signIn")}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t("loading") : t("sendReset")}
          </Button>
          <Link to="/login" className="block text-sm text-accent">
            {t("signIn")}
          </Link>
        </form>
      )}
    </AuthFrame>
  );
}
