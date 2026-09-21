import type { Currency } from "./types.ts";

export function householdTimeZone(currency: Currency): string {
  return currency === "JPY" ? "Asia/Tokyo" : "Asia/Kuala_Lumpur";
}

export type ZonedDate = {
  year: number;
  month: number;
  day: number;
  ymd: string;
  yearMonth: string;
};

export function zonedNow(timeZone: string, now = new Date()): ZonedDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    year,
    month,
    day,
    ymd: `${year}-${mm}-${dd}`,
    yearMonth: `${year}-${mm}`,
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function lastDayOfMonth(yearMonth: string): string {
  const [ys, ms] = yearMonth.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const last = daysInMonth(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function monthRange(yearMonth: string): { start: string; end: string } {
  return { start: `${yearMonth}-01`, end: lastDayOfMonth(yearMonth) };
}

export function addMonths(yearMonth: string, delta: number): string {
  const [ys, ms] = yearMonth.split("-");
  const date = new Date(Date.UTC(Number(ys), Number(ms) - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function compareYearMonth(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isFutureYmd(ymd: string, todayYmd: string): boolean {
  return ymd > todayYmd;
}
