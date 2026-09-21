import type { Currency } from "./types.ts";

/** Round a major-unit input to the currency's smallest unit (JPY yen, MYR sen). */
export function toMinorUnits(major: number, currency: Currency): number {
  if (!Number.isFinite(major) || major < 0) return 0;
  if (currency === "JPY") return Math.round(major);
  return Math.round(major * 100);
}

export function fromMinorUnits(minor: number, currency: Currency): number {
  if (currency === "JPY") return minor;
  return minor / 100;
}

export function formatMoney(
  minor: number,
  currency: Currency,
  opts: { signed?: boolean } = {},
): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const body =
    currency === "JPY"
      ? `¥${Math.round(abs).toLocaleString("en-US")}`
      : `RM${(abs / 100).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
  if (opts.signed) return negative ? `-${body}` : minor > 0 ? body : body;
  return negative ? `-${body}` : body;
}

export function moneyStep(currency: Currency): string {
  return currency === "JPY" ? "1" : "0.01";
}

export function moneyInputValue(minor: number, currency: Currency): string {
  if (currency === "JPY") return String(minor);
  return (minor / 100).toFixed(2);
}

export function parseMajorInput(raw: string, currency: Currency): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return toMinorUnits(n, currency);
}
