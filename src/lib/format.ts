import { formatInZone } from "./domain/date-range";

export const fmtDate = (d: Date, tz: string) => formatInZone(d, "MMMM d, yyyy", tz);
export const fmtShortDate = (d: Date, tz: string) => formatInZone(d, "MMM d", tz);
export const fmtTime = (d: Date, tz: string) => formatInZone(d, "h:mm a", tz);
export const fmtDateTime = (d: Date, tz: string) => formatInZone(d, "MMM d, yyyy · h:mm a", tz);
