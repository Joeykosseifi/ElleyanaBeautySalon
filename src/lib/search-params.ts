import { isDatePreset, resolveDateRange, type DatePreset } from "./domain/date-range";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Read ?range=&from=&to= into a resolved salon-local date range. */
export function rangeFromParams(sp: Record<string, string | string[] | undefined>, timeZone: string, fallback: DatePreset) {
  const raw = param(sp, "range");
  const preset = isDatePreset(raw) ? raw : fallback;
  return resolveDateRange(preset, timeZone, { from: param(sp, "from"), to: param(sp, "to") });
}
