import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { History, Home, Settings } from "lucide-react";
import { useI18n } from "./locale";
import { cn } from "@/lib/utils";

export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <div className={cn("flex-1", padded && "px-4 pb-28 pt-5")}>{children}</div>
    </div>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", label: t("home"), icon: Home },
    { to: "/history", label: t("history"), icon: History },
    { to: "/settings", label: t("settings"), icon: Settings },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {items.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                active ? "text-accent" : "text-muted",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AuthFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 pb-28">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">{t("appName")}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
          {t("tagline")}
        </h1>
      </div>
      <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">{children}</div>
    </div>
  );
}

export function Splash() {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div>
        <p className="text-sm tracking-wide text-muted">{t("appName")}</p>
        <p className="mt-2 text-sm text-subtle">{t("loading")}</p>
        {slow ? (
          <a href="/login" className="mt-5 inline-block min-h-11 px-4 text-sm font-medium text-accent">
            {t("continueToLogin")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
