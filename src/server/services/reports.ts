import { prisma } from "../db";
import type { ServiceContext } from "../context";
import {
  calculateDailySeries,
  calculateEmployeeMetrics,
  calculateReports,
  calculateServiceMetrics,
  type PeriodPayment,
  type ReportSale,
} from "@/lib/domain/reports";
import { dayKey, daysInRange, type DateRange } from "@/lib/domain/date-range";
import { calculateAmountPaid, calculateRemaining } from "@/lib/domain/sale-calculations";

async function loadPeriod(ctx: ServiceContext, range: Pick<DateRange, "start" | "end">) {
  const [sales, payments, expenses] = await Promise.all([
    // Active (non-voided) sales whose service date falls in the period, with ALL their payments to date.
    prisma.sale.findMany({
      where: { salonId: ctx.salonId, voidedAt: null, createdAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        clientId: true,
        employeeId: true,
        createdAt: true,
        subtotalCents: true,
        discountCents: true,
        finalTotalCents: true,
        items: {
          select: {
            serviceId: true,
            isCustom: true,
            serviceNameSnapshot: true,
            categoryNameSnapshot: true,
            quantity: true,
            lineTotalCents: true,
            serviceCostSnapshotCents: true,
            employeeId: true,
          },
        },
        payments: { select: { amountCents: true, method: true, createdAt: true } },
      },
    }),
    // Payments whose payment date falls in the period (cash view), whatever the sale date.
    // Payments attached to a voided sale no longer count as collected revenue.
    prisma.payment.findMany({
      where: { salonId: ctx.salonId, createdAt: { gte: range.start, lt: range.end }, sale: { voidedAt: null } },
      select: {
        amountCents: true,
        method: true,
        createdAt: true,
        saleId: true,
        // The lines of the paid sale, so a payment is shared between the employees who did the work.
        sale: { select: { employeeId: true, items: { select: { employeeId: true, lineTotalCents: true } } } },
      },
    }),
    prisma.expense.findMany({
      where: { salonId: ctx.salonId, date: { gte: range.start, lt: range.end } },
      select: { amountCents: true, category: true },
    }),
  ]);
  const periodPayments: PeriodPayment[] = payments.map((p) => ({
    amountCents: p.amountCents,
    method: p.method,
    createdAt: p.createdAt,
    saleId: p.saleId,
    employeeId: p.sale.employeeId,
    saleItems: p.sale.items,
  }));
  return { sales: sales as ReportSale[], periodPayments, expenses };
}

/** Lightweight figures for the Home screen. */
export async function getSummary(ctx: ServiceContext, range: Pick<DateRange, "start" | "end">) {
  const data = await loadPeriod(ctx, range);
  return calculateReports(data);
}

/** Money owed across ALL active sales, regardless of date (voided sales owe nothing). */
export async function getTotalOutstanding(ctx: ServiceContext): Promise<number> {
  const sales = await prisma.sale.findMany({
    where: { salonId: ctx.salonId, voidedAt: null, paymentStatus: { in: ["PARTIAL", "UNPAID"] } },
    select: { finalTotalCents: true, payments: { select: { amountCents: true } } },
  });
  return sales.reduce((s, sale) => s + calculateRemaining(sale.finalTotalCents, calculateAmountPaid(sale.payments)), 0);
}

export async function getFullReport(ctx: ServiceContext, range: DateRange) {
  const [data, employees, totalOutstandingCents] = await Promise.all([
    loadPeriod(ctx, range),
    prisma.employee.findMany({
      where: { salonId: ctx.salonId },
      select: { id: true, name: true, commissionType: true, commissionValue: true, active: true },
    }),
    getTotalOutstanding(ctx),
  ]);
  const summary = calculateReports(data);
  const services = calculateServiceMetrics(data.sales);
  const employeeMetrics = calculateEmployeeMetrics(data.sales, data.periodPayments, employees).filter(
    (m) => m.salesCount > 0 || m.collectedRevenueCents > 0 || employees.find((e) => e.id === m.employeeId)?.active,
  );
  const days = daysInRange(range, ctx.timezone);
  const daily = days.length > 1 ? calculateDailySeries(data.sales, data.periodPayments, days, (d) => dayKey(d, ctx.timezone)) : [];
  return { summary, services, employees: employeeMetrics, daily, totalOutstandingCents };
}
