import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { t as translate, tf as translatef, type MsgKey } from "@/lib/kakeibo/i18n";
import type { Locale } from "@/lib/kakeibo/types";

const KEY = "kakeibo.locale";

function readStored(): Locale {
  if (typeof window === "undefined") return "ja";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "ja" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "ja";
}

type Ctx = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MsgKey) => string;
  tf: (key: MsgKey, vars: Record<string, string | number>) => string;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? readStored);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale,
      t: (key) => translate(locale, key),
      tf: (key, vars) => translatef(locale, key, vars),
    }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function fallbackCtx(locale: Locale): Ctx {
  return {
    locale,
    setLocale: () => undefined,
    t: (key) => translate(locale, key),
    tf: (key, vars) => translatef(locale, key, vars),
  };
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  return ctx ?? fallbackCtx("ja");
}

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
      <button
        type="button"
        className={`min-h-9 rounded-md px-3 ${locale === "ja" ? "bg-surface font-medium text-fg shadow-[var(--shadow-border)]" : "text-muted"}`}
        onClick={() => setLocale("ja")}
      >
        日本語
      </button>
      <button
        type="button"
        className={`min-h-9 rounded-md px-3 ${locale === "en" ? "bg-surface font-medium text-fg shadow-[var(--shadow-border)]" : "text-muted"}`}
        onClick={() => setLocale("en")}
      >
        English
      </button>
    </div>
  );
}
