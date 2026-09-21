import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { RedirectToSignIn, SIGN_IN_PATH } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBootstrap } from "@/lib/server/kakeibo";
import type { PublicProfile } from "@/lib/server/kakeibo";
import { Splash } from "./app-shell";
import { useI18n } from "./locale";

type Boot = { emailVerified: boolean; profile: PublicProfile | null };

/** Treat a hung get-session as signed-out so we never splash forever. */
function useSettledSession() {
  const { user, isPending } = useCurrentUserState();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setStalled(false);
      return;
    }
    const id = window.setTimeout(() => setStalled(true), 5000);
    return () => window.clearTimeout(id);
  }, [isPending]);

  return { user, isPending: isPending && !stalled };
}

export function useBootstrap() {
  const { user, isPending } = useSettledSession();
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isPending || !user) {
      setBoot(null);
      setError(false);
      return;
    }
    let cancelled = false;
    getBootstrap()
      .then((data) => {
        if (!cancelled) {
          setError(false);
          setBoot(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user?.id]);

  return { user, isPending, boot, error };
}

export function RequireSession({ children }: { children: ReactNode }) {
  const { user, isPending } = useSettledSession();
  if (isPending) return <Splash />;
  if (!user) return <RedirectToSignIn to={SIGN_IN_PATH} />;
  return <>{children}</>;
}

export function AppGate({ children }: { children: ReactNode }) {
  const { user, isPending, boot, error } = useBootstrap();
  const { t, setLocale } = useI18n();

  useEffect(() => {
    if (boot?.profile?.locale) setLocale(boot.profile.locale);
  }, [boot?.profile?.locale, setLocale]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <p className="text-sm text-danger">{t("saveFailed")}</p>
      </div>
    );
  }
  if (isPending || (user && !boot)) return <Splash />;
  if (!user) return <RedirectToSignIn to={SIGN_IN_PATH} />;
  if (!boot?.emailVerified) return <Navigate to="/verify-email" search={{}} />;
  if (!boot.profile?.onboardingCompleted) return <Navigate to="/onboarding" />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isPending, boot } = useBootstrap();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending) return;
    if (user && boot?.emailVerified && boot.profile?.onboardingCompleted) {
      void navigate({ to: "/" });
    } else if (user && boot && !boot.emailVerified) {
      void navigate({ to: "/verify-email", search: {} });
    } else if (user && boot?.emailVerified && !boot.profile?.onboardingCompleted) {
      void navigate({ to: "/onboarding" });
    }
  }, [user, isPending, boot, navigate]);

  // Show the auth form immediately for guests (SSR + first paint). Only wait
  // when a session exists and we still need bootstrap to decide the next route.
  if (user && (isPending || !boot)) return <Splash />;
  return <>{children}</>;
}
