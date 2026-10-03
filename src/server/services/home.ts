import type { ServiceContext } from "../context";
import { resolveDateRange } from "@/lib/domain/date-range";
import { getSummary } from "./reports";
import { listSales, type SaleView } from "./sales";

export const RECENT_SALES_ON_HOME = 8;

/** Everything the Home "Today" panel shows. Voided sales are excluded by the underlying queries. */
export interface TodaySnapshot {
  serviceValueCents: number;
  collectedRevenueCents: number;
  outstandingCents: number;
  clientsCount: number;
  servicesCount: number;
  salesCount: number;
  recent: SaleView[];
}

export async function getTodaySnapshot(ctx: ServiceContext): Promise<TodaySnapshot> {
  const today = resolveDateRange("today", ctx.timezone);
  const [summary, recent] = await Promise.all([
    getSummary(ctx, today),
    listSales(ctx, { start: today.start, end: today.end, take: RECENT_SALES_ON_HOME }),
  ]);
  return {
    serviceValueCents: summary.serviceValueCents,
    collectedRevenueCents: summary.collectedRevenueCents,
    outstandingCents: summary.outstandingCents,
    clientsCount: summary.clientsCount,
    servicesCount: summary.servicesCount,
    salesCount: summary.salesCount,
    recent,
  };
}
