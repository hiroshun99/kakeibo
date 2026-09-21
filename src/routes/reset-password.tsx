import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { resetPassword } from "@/lib/server/auth-flows";
import { passwordValid } from "@/lib/kakeibo/password";
import { AuthFrame } from "@/components/app-shell";
import { LanguageToggle, useI18n } from "@/components/locale";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ResetPage,
});

function ResetPage() {
  const { token } = Route.useSearch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      await resetPassword({ data: { token, password } });
      await navigate({ to: "/login" });
    } catch {
      setError(t("verifyInvalid"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("resetPassword")}</h2>
        <LanguageToggle />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">{t("newPassword")}</Label>
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
        <Button type="submit" className="w-full" disabled={pending || !token}>
          {pending ? t("loading") : t("save")}
        </Button>
      </form>
      <Link to="/login" className="mt-4 block text-sm text-accent">
        {t("signIn")}
      </Link>
    </AuthFrame>
  );
}
