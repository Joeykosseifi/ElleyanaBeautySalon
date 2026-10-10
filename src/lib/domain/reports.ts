/**
 * Report calculations — pure functions over plain data so they are easy to test.
 *
 * Metric definitions (shown to the owner on the Reports page as well):
 *
 * - Service Value       Σ final total of sales whose SERVICE DATE is in the period (after discounts).
 * - Collected Revenue   Σ payments whose PAYMENT DATE is in the period — including payments
 *                       received today for older sales. This is the cash view.
 * - Outstanding         For sales in the period: Σ (final total − all payments received so far).
 * - Clients             Unique registered clients + each walk-in visit in the period.
 * - Services            Σ quantity of services performed in the period.
 * - Service Costs       Σ estimated cost snapshot × quantity of services performed in the period.
 * - Expenses            Σ operating expenses dated in the period.
 * - Est. Cash Profit    Collected Revenue − Service Costs − Expenses.
 * - Potential Revenue   Collected Revenue + Outstanding.
 * - Average Sale        Service Value ÷ number of sales.
 */
import { allocateProportionally } from "./money";
import {
  calculateAmountPaid,
  calculatePaymentStatus,
  calculateProfit,
  calculateRemaining,
  type PaymentStatus,
} from "./sale-calculations";

export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "WHISH", "OMT", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ReportSaleItem {
  serviceId: string | null;
  /** One-off custom service typed in at checkout. */
  isCustom?: boolean;
  serviceNameSnapshot: string;
  categoryNameSnapshot?: string | null;
  quantity: number;
  /** Actual charged price × quantity — reports never use the catalog price. */
  lineTotalCents: number;
  serviceCostSnapshotCents: number;
  /** Who performed this line. When absent, the sale's employee is used. */
  employeeId?: string | null;
}

export interface ReportPayment {
  amountCents: number;
  method: PaymentMethod;
  createdAt: Date;
}

export interface ReportSale {
  id: string;
  clientId: string | null;
  employeeId: string | null;
  createdAt: Date;
  subtotalCents: number;
  discountCents: number;
  finalTotalCents: number;
  items: ReportSaleItem[];
  /** ALL payments for the sale to date (not only the ones in the period). */
  payments: ReportPayment[];
}

/**
 * A payment received in the period. `saleItems` (the lines of the sale it pays for)
 * splits it between the employees who performed those lines; without them the whole
 * payment goes to `employeeId`.
 */
export interface PeriodPayment extends ReportPayment {
  saleId: string;
  employeeId: string | null;
  saleItems?: { employeeId: string | null; lineTotalCents: number }[];
}

export interface ReportExpense {
  amountCents: number;
  category: string;
}

export interface ReportEmployee {
  id: string;
  name: string;
  commissionType: "NONE" | "PERCENTAGE" | "FIXED";
  commissionValue: number;
}

export interface StatusBucket {
  count: number;
  valueCents: number;
}

export interface ReportSummary {
  serviceValueCents: number;
  collectedRevenueCents: number;
  outstandingCents: number;
  clientsCount: number;
  servicesCount: number;
  salesCount: number;
  serviceCostsCents: number;
  expensesCents: number;
  estimatedCashProfitCents: number;
  potentialRevenueCents: number;
  averageSaleCents: number;
  discountsCents: number;
  paymentBreakdown: Record<PaymentMethod, number>;
  paymentStatus: Record<PaymentStatus, StatusBucket>;
  expensesByCategory: Record<string, number>;
}

function sumBy<T>(list: T[], fn: (t: T) => number): number {
  return list.reduce((s, t) => s + fn(t), 0);
}

/** Count unique registered clients plus each walk-in (no client) sale. */
export function countClients(sales: Pick<ReportSale, "clientId">[]): number {
  const ids = new Set<string>();
  let walkIns = 0;
  for (const s of sales) {
    if (s.clientId) ids.add(s.clientId);
    else walkIns += 1;
  }
  return ids.size + walkIns;
}

export function saleAmountPaid(sale: Pick<ReportSale, "payments">): number {
  return calculateAmountPaid(sale.payments);
}

export function calculateReports(input: {
  sales: ReportSale[];
  periodPayments: ReportPayment[];
  expenses: ReportExpense[];
}): ReportSummary {
  const { sales, periodPayments, expenses } = input;

  const serviceValueCents = sumBy(sales, (s) => s.finalTotalCents);
  const collectedRevenueCents = sumBy(periodPayments, (p) => p.amountCents);
  const outstandingCents = sumBy(sales, (s) => calculateRemaining(s.finalTotalCents, saleAmountPaid(s)));
  const servicesCount = sumBy(sales, (s) => sumBy(s.items, (i) => i.quantity));
  const serviceCostsCents = sumBy(sales, (s) =>
    sumBy(s.items, (i) => i.serviceCostSnapshotCents * i.quantity),
  );
  const expensesCents = sumBy(expenses, (e) => e.amountCents);
  const discountsCents = sumBy(sales, (s) => s.discountCents);

  const paymentBreakdown = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  for (const p of periodPayments) paymentBreakdown[p.method] += p.amountCents;

  const paymentStatus: Record<PaymentStatus, StatusBucket> = {
    PAID: { count: 0, valueCents: 0 },
    PARTIAL: { count: 0, valueCents: 0 },
    UNPAID: { count: 0, valueCents: 0 },
  };
  for (const s of sales) {
    const status = calculatePaymentStatus(s.finalTotalCents, saleAmountPaid(s));
    paymentStatus[status].count += 1;
    paymentStatus[status].valueCents += s.finalTotalCents;
  }

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amountCents;

  const profit = calculateProfit({
    collectedRevenueCents,
    outstandingCents,
    serviceCostsCents,
    operatingExpensesCents: expensesCents,
  });

  return {
    serviceValueCents,
    collectedRevenueCents,
    outstandingCents,
    clientsCount: countClients(sales),
    servicesCount,
    salesCount: sales.length,
    serviceCostsCents,
    expensesCents,
    estimatedCashProfitCents: profit.estimatedCashProfitCents,
    potentialRevenueCents: profit.potentialRevenueCents,
    averageSaleCents: sales.length ? Math.round(serviceValueCents / sales.length) : 0,
    discountsCents,
    paymentBreakdown,
    paymentStatus,
    expensesByCategory,
  };
}

export interface ServiceMetric {
  key: string;
  serviceId: string | null;
  isCustom: boolean;
  name: string;
  category: string | null;
  quantity: number;
  /** After discounts (discount spread across lines proportionally). */
  serviceValueCents: number;
  /** Share of payments received so far on these sales. */
  collectedCents: number;
  outstandingCents: number;
  estimatedCostCents: number;
  /** Collected − Estimated Cost */
  estimatedGrossProfitCents: number;
}

/**
 * Per-service breakdown. A sale's discount and its payments are spread across its
 * lines in proportion to each line's value, so per-service figures always add up
 * to the sale totals exactly.
 */
export function calculateServiceMetrics(sales: ReportSale[]): ServiceMetric[] {
  const map = new Map<string, ServiceMetric>();
  for (const sale of sales) {
    const weights = sale.items.map((i) => i.lineTotalCents);
    const values = allocateProportionally(sale.finalTotalCents, weights);
    const paid = Math.min(saleAmountPaid(sale), sale.finalTotalCents);
    const collected = allocateProportionally(paid, weights);
    sale.items.forEach((item, idx) => {
      // Custom services are grouped by name (case-insensitive) and kept apart from catalog services.
      const key = item.isCustom
        ? `custom:${item.serviceNameSnapshot.trim().toLowerCase()}`
        : (item.serviceId ?? `name:${item.serviceNameSnapshot}`);
      const m =
        map.get(key) ??
        ({
          key,
          serviceId: item.serviceId,
          isCustom: Boolean(item.isCustom),
          name: item.serviceNameSnapshot,
          category: item.categoryNameSnapshot ?? null,
          quantity: 0,
          serviceValueCents: 0,
          collectedCents: 0,
          outstandingCents: 0,
          estimatedCostCents: 0,
          estimatedGrossProfitCents: 0,
        } satisfies ServiceMetric);
      m.quantity += item.quantity;
      m.serviceValueCents += values[idx];
      m.collectedCents += collected[idx];
      m.outstandingCents += values[idx] - collected[idx];
      m.estimatedCostCents += item.serviceCostSnapshotCents * item.quantity;
      m.estimatedGrossProfitCents = m.collectedCents - m.estimatedCostCents;
      map.set(key, m);
    });
  }
  return [...map.values()].sort((a, b) => b.serviceValueCents - a.serviceValueCents || a.name.localeCompare(b.name));
}

export interface EmployeeMetric {
  employeeId: string | null;
  name: string;
  clientsHandled: number;
  servicesPerformed: number;
  salesCount: number;
  serviceValueCents: number;
  /** Payments received in the period on this employee's sales (payment date based). */
  collectedRevenueCents: number;
  outstandingCents: number;
  commissionType: ReportEmployee["commissionType"];
  /** null when commission is not enabled for this employee. */
  estimatedCommissionCents: number | null;
}

/** PERCENTAGE: % of Service Value. FIXED: amount per service performed. */
export function calculateCommission(
  employee: Pick<ReportEmployee, "commissionType" | "commissionValue">,
  serviceValueCents: number,
  servicesPerformed: number,
): number | null {
  switch (employee.commissionType) {
    case "PERCENTAGE":
      return Math.round((serviceValueCents * employee.commissionValue) / 10_000);
    case "FIXED":
      return employee.commissionValue * servicesPerformed;
    default:
      return null;
  }
}

/**
 * Per-employee figures. Each service line belongs to the employee who performed it
 * (a sale can be shared by several employees). A sale's total, discount and payments
 * are split across its lines in proportion to each line's value — the same split the
 * per-service report uses — so the employees' figures always add up to the salon's.
 */
export function calculateEmployeeMetrics(
  sales: ReportSale[],
  periodPayments: PeriodPayment[],
  employees: ReportEmployee[],
): EmployeeMetric[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  type Acc = { services: number; value: number; outstanding: number; collected: number; sales: Set<string>; clientSales: ReportSale[] };
  const acc = new Map<string | null, Acc>();
  const get = (id: string | null) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { services: 0, value: 0, outstanding: 0, collected: 0, sales: new Set(), clientSales: [] }));
    return a;
  };
  for (const e of employees) get(e.id);

  for (const sale of sales) {
    const weights = sale.items.map((i) => i.lineTotalCents);
    const values = allocateProportionally(sale.finalTotalCents, weights);
    const paid = allocateProportionally(Math.min(saleAmountPaid(sale), sale.finalTotalCents), weights);
    sale.items.forEach((item, idx) => {
      const a = get(item.employeeId !== undefined ? item.employeeId : sale.employeeId);
      a.services += item.quantity;
      a.value += values[idx];
      a.outstanding += values[idx] - paid[idx];
      if (!a.sales.has(sale.id)) {
        a.sales.add(sale.id);
        a.clientSales.push(sale);
      }
    });
  }
  for (const p of periodPayments) {
    if (p.saleItems && p.saleItems.length > 0) {
      const shares = allocateProportionally(p.amountCents, p.saleItems.map((i) => i.lineTotalCents));
      p.saleItems.forEach((i, idx) => (get(i.employeeId).collected += shares[idx]));
    } else {
      get(p.employeeId).collected += p.amountCents;
    }
  }

  const result: EmployeeMetric[] = [];
  for (const [id, a] of acc) {
    if (id === null && a.sales.size === 0 && a.collected === 0) continue;
    const emp = id ? byId.get(id) : undefined;
    result.push({
      employeeId: id,
      name: emp?.name ?? (id ? "Former employee" : "Unassigned"),
      clientsHandled: countClients(a.clientSales),
      servicesPerformed: a.services,
      salesCount: a.sales.size,
      serviceValueCents: a.value,
      collectedRevenueCents: a.collected,
      outstandingCents: a.outstanding,
      commissionType: emp?.commissionType ?? "NONE",
      estimatedCommissionCents: emp ? calculateCommission(emp, a.value, a.services) : null,
    });
  }
  return result.sort((x, y) => y.serviceValueCents - x.serviceValueCents || x.name.localeCompare(y.name));
}

export interface DailyPoint {
  day: string;
  serviceValueCents: number;
  collectedCents: number;
}

/** Day-by-day Service Value vs Collected. `dayKey` maps a date to the salon-local day. */
export function calculateDailySeries(
  sales: ReportSale[],
  periodPayments: ReportPayment[],
  days: string[],
  dayKey: (d: Date) => string,
): DailyPoint[] {
  const points = new Map(days.map((d) => [d, { day: d, serviceValueCents: 0, collectedCents: 0 }]));
  for (const s of sales) {
    const p = points.get(dayKey(s.createdAt));
    if (p) p.serviceValueCents += s.finalTotalCents;
  }
  for (const pay of periodPayments) {
    const p = points.get(dayKey(pay.createdAt));
    if (p) p.collectedCents += pay.amountCents;
  }
  return [...points.values()];
}
