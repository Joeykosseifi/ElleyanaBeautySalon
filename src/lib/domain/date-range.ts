/**
 * Date range presets resolved in the salon's own time zone, so "Today" means the
 * salon's today regardless of where the server runs.
 */
import { TZDate, tz } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom", label: "Custom" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

export interface DateRange {
  preset: DatePreset;
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. */
  end: Date;
  /** Salon-local calendar days (yyyy-MM-dd) as entered / resolved. */
  fromDay: string;
  toDay: string;
  label: string;
}

export function isDatePreset(v: unknown): v is DatePreset {
  return typeof v === "string" && DATE_PRESETS.some((p) => p.value === v);
}

/** Salon-local calendar day key for an instant. */
export function dayKey(date: Date, timeZone: string): string {
  return format(date, "yyyy-MM-dd", { in: tz(timeZone) });
}

/** Parse a "yyyy-MM-dd" salon-local day to the instant it starts. */
export function startOfLocalDay(day: string, timeZone: string): Date | null {
  const parsed = parse(day, "yyyy-MM-dd", new Date());
  if (!isValid(parsed) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new TZDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), timeZone);
}

function describe(start: Date, endExclusive: Date, timeZone: string): string {
  const inTz = { in: tz(timeZone) };
  const last = addDays(endExclusive, -1, inTz);
  if (dayKey(start, timeZone) === dayKey(last, timeZone)) return format(start, "MMMM d, yyyy", inTz);
  const sameYear = format(start, "yyyy", inTz) === format(last, "yyyy", inTz);
  return `${format(start, sameYear ? "MMM d" : "MMM d, yyyy", inTz)} – ${format(last, "MMM d, yyyy", inTz)}`;
}

export function resolveDateRange(
  preset: DatePreset,
  timeZone: string,
  opts: { now?: Date; from?: string | null; to?: string | null } = {},
): DateRange {
  const now = opts.now ?? new Date();
  const inTz = { in: tz(timeZone) };
  const today = startOfDay(now, inTz);
  let start: Date;
  let end: Date;

  switch (preset) {
    case "yesterday":
      start = addDays(today, -1, inTz);
      end = today;
      break;
    case "7d":
      start = addDays(today, -6, inTz);
      end = addDays(today, 1, inTz);
      break;
    case "week":
      start = startOfWeek(today, { ...inTz, weekStartsOn: 1 });
      end = addDays(start, 7, inTz);
      break;
    case "month":
      start = startOfMonth(today, inTz);
      end = addMonths(start, 1, inTz);
      break;
    case "lastMonth":
      end = startOfMonth(today, inTz);
      start = addMonths(end, -1, inTz);
      break;
    case "custom": {
      const from = opts.from ? startOfLocalDay(opts.from, timeZone) : null;
      const to = opts.to ? startOfLocalDay(opts.to, timeZone) : null;
      start = from ?? today;
      const toStart = to ?? start;
      end = addDays(toStart < start ? start : toStart, 1, inTz);
      break;
    }
    case "today":
    default:
      start = today;
      end = addDays(today, 1, inTz);
  }

  const lastDay = addDays(end, -1, inTz);
  return {
    preset,
    start: new Date(start.getTime()),
    end: new Date(end.getTime()),
    fromDay: dayKey(start, timeZone),
    toDay: dayKey(lastDay, timeZone),
    label: describe(start, end, timeZone),
  };
}

/** Every salon-local day in a range (used for charts). Capped to avoid huge loops. */
export function daysInRange(range: Pick<DateRange, "start" | "end">, timeZone: string, max = 400): string[] {
  const inTz = { in: tz(timeZone) };
  const startLocal = startOfDay(range.start, inTz);
  const count = Math.min(differenceInCalendarDays(range.end, range.start, inTz), max);
  const days: string[] = [];
  for (let i = 0; i < Math.max(count, 1); i++) days.push(dayKey(addDays(startLocal, i, inTz), timeZone));
  return days;
}

export function greetingFor(date: Date, timeZone: string): string {
  const hour = Number(format(date, "H", { in: tz(timeZone) }));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function formatInZone(date: Date, pattern: string, timeZone: string): string {
  return format(date, pattern, { in: tz(timeZone) });
}

/** "yyyy-MM-ddTHH:mm" in the salon's time zone, for <input type="datetime-local">. */
export function toLocalDateTimeInput(date: Date, timeZone: string): string {
  return format(date, "yyyy-MM-dd'T'HH:mm", { in: tz(timeZone) });
}

/** Parse a salon-local "yyyy-MM-ddTHH:mm" into an instant, or null if invalid. */
export function fromLocalDateTimeInput(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const local = new TZDate(y, mo - 1, d, h, mi, timeZone);
  // Reject dates that roll over (e.g. 31 February) and DST gaps that shift the time.
  if (toLocalDateTimeInput(local, timeZone) !== value) return null;
  return new Date(local.getTime());
}
