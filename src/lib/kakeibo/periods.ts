import { addMonths, daysInMonth, monthRange } from "./dates.ts";

export type CycleMode = "calendar" | "payday";

export type Period = {
  id: string;
  start: string;
  end: string;
  mode: CycleMode;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [ys, ms, ds] = ymd.split("-");
  return { year: Number(ys), month: Number(ms), day: Number(ds ?? "1") };
}

export function addDays(ymd: string, delta: number): string {
  const { year, month, day } = parseYmd(ymd);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Shift a calendar date by whole months, clamping the day to the target month. */
export function addMonthsClamped(ymd: string, delta: number): string {
  const { year, month, day } = parseYmd(ymd);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return formatYmd(y, m, Math.min(day, daysInMonth(y, m)));
}

export function daysInclusive(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function clampPayday(payday: number): number {
  if (!Number.isFinite(payday)) return 25;
  return Math.min(28, Math.max(1, Math.trunc(payday)));
}

export function isPeriodId(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function paydayStart(ymd: string, payday: number): string {
  const day = clampPayday(payday);
  const { year, month, day: today } = parseYmd(ymd);
  const thisPay = Math.min(day, daysInMonth(year, month));
  if (today >= thisPay) return formatYmd(year, month, thisPay);
  return addMonthsClamped(formatYmd(year, month, thisPay), -1);
}

export function boundsOf(id: string): { start: string; end: string } {
  if (/^\d{4}-\d{2}$/.test(id)) return monthRange(id);
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) {
    return { start: id, end: addDays(addMonthsClamped(id, 1), -1) };
  }
  throw new Error(`bad period ${id}`);
}

export function periodContaining(ymd: string, mode: CycleMode, payday: number): Period {
  if (mode === "payday") {
    const start = paydayStart(ymd, payday);
    const { end } = boundsOf(start);
    return { id: start, start, end, mode: "payday" };
  }
  const id = ymd.slice(0, 7);
  const range = monthRange(id);
  return { id, start: range.start, end: range.end, mode: "calendar" };
}

export function shiftPeriodId(id: string, delta: number): string {
  if (/^\d{4}-\d{2}$/.test(id)) return addMonths(id, delta);
  return addMonthsClamped(id, delta);
}

export function periodLabel(id: string, locale: "ja" | "en"): string {
  if (/^\d{4}-\d{2}$/.test(id)) {
    const { year, month } = parseYmd(`${id}-01`);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return date.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  }
  const { start, end } = boundsOf(id);
  const { year, month, day } = parseYmd(start);
  const endParts = parseYmd(end);
  const a = `${month}/${day}`;
  const b = `${endParts.month}/${endParts.day}`;
  return locale === "ja" ? `${year}年 ${a}–${b}` : `${a} – ${b}, ${year}`;
}

/** Monday–Sunday week containing `today`, clipped to the period. Null outside it. */
export function weekWindow(
  periodStart: string,
  periodEnd: string,
  today: string,
): { start: string; end: string; days: number } | null {
  if (today < periodStart || today > periodEnd) return null;
  const { year, month, day } = parseYmd(today);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const sundayOffset = dow === 0 ? 0 : 7 - dow;
  let start = addDays(today, -mondayOffset);
  let end = addDays(today, sundayOffset);
  if (start < periodStart) start = periodStart;
  if (end > periodEnd) end = periodEnd;
  return { start, end, days: daysInclusive(start, end) };
}

export function weekBudget(spendable: number, periodDays: number, weekDays: number): number {
  if (periodDays <= 0 || weekDays <= 0 || spendable <= 0) return 0;
  return Math.floor((spendable * weekDays) / periodDays);
}
