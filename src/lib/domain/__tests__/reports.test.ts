import { describe, expect, it } from "vitest";
import {
  calculateDailySeries,
  calculateEmployeeMetrics,
  calculateReports,
  calculateServiceMetrics,
  type PeriodPayment,
  type ReportSale,
} from "../reports";
import { dayKey, resolveDateRange } from "../date-range";

const TZ = "Asia/Beirut";
const d = (iso: string) => new Date(iso);

function sale(partial: Partial<ReportSale> & Pick<ReportSale, "id" | "items">): ReportSale {
  const subtotal = partial.items.reduce((s, i) => s + i.lineTotalCents, 0);
  const discount = partial.discountCents ?? 0;
  return {
    clientId: null,
    employeeId: null,
    createdAt: d("2026-10-01T09:00:00Z"),
    subtotalCents: subtotal,
    discountCents: discount,
    finalTotalCents: subtotal - discount,
    payments: [],
    ...partial,
  };
}

const item = (name: string, price: number, qty = 1, cost = 0, serviceId: string | null = name) => ({
  serviceId,
  serviceNameSnapshot: name,
  categoryNameSnapshot: null,
  quantity: qty,
  lineTotalCents: price * qty,
  serviceCostSnapshotCents: cost,
});

// The three acceptance-test sales from the spec, on the same day.
const sarah = sale({
  id: "s1",
  clientId: "sarah",
  employeeId: "maya",
  items: [item("Manicure", 1000, 1, 200), item("Pedicure", 1500, 1, 300)],
  payments: [{ amountCents: 2500, method: "CASH", createdAt: d("2026-10-01T09:00:00Z") }],
});
const jessica = sale({
  id: "s2",
  clientId: "jessica",
  employeeId: "sara",
  items: [item("Hair Color", 5000, 1, 1200)],
});
const maria = sale({
  id: "s3",
  clientId: "maria",
  employeeId: "maya",
  items: [item("Gel Polish", 2000, 1, 400), item("Pedicure", 1500, 1, 300)],
  payments: [{ amountCents: 2000, method: "CASH", createdAt: d("2026-10-01T10:00:00Z") }],
});

describe("daily report", () => {
  it("separates service value, collected revenue and outstanding", () => {
    const sales = [sarah, jessica, maria];
    const periodPayments = sales.flatMap((s) => s.payments);
    const r = calculateReports({ sales, periodPayments, expenses: [{ amountCents: 1000, category: "PRODUCTS" }] });

    expect(r.serviceValueCents).toBe(11000);
    expect(r.collectedRevenueCents).toBe(4500);
    expect(r.outstandingCents).toBe(6500);
    expect(r.serviceValueCents).toBe(r.collectedRevenueCents + r.outstandingCents);
    expect(r.servicesCount).toBe(5);
    expect(r.clientsCount).toBe(3);
    expect(r.paymentBreakdown.CASH).toBe(4500);
    expect(r.paymentStatus.PAID).toEqual({ count: 1, valueCents: 2500 });
    expect(r.paymentStatus.PARTIAL).toEqual({ count: 1, valueCents: 3500 });
    expect(r.paymentStatus.UNPAID).toEqual({ count: 1, valueCents: 5000 });
    expect(r.serviceCostsCents).toBe(2400);
    expect(r.estimatedCashProfitCents).toBe(4500 - 2400 - 1000);
    expect(r.potentialRevenueCents).toBe(11000);
    expect(r.averageSaleCents).toBe(Math.round(11000 / 3));
  });

  it("counts each walk-in as a client and repeat clients once", () => {
    const sales = [
      sale({ id: "a", clientId: "c1", items: [item("Manicure", 1000)] }),
      sale({ id: "b", clientId: "c1", items: [item("Pedicure", 1500)] }),
      sale({ id: "c", clientId: null, items: [item("Haircut", 2500)] }),
      sale({ id: "d", clientId: null, items: [item("Haircut", 2500)] }),
    ];
    expect(calculateReports({ sales, periodPayments: [], expenses: [] }).clientsCount).toBe(3);
  });
});

describe("payment date rule", () => {
  // Sale on Oct 1 for $100, unpaid. Client pays $100 on Oct 5.
  const oct1Sale = sale({
    id: "late",
    createdAt: d("2026-10-01T08:00:00Z"),
    items: [item("Facial Treatment", 10000)],
    payments: [{ amountCents: 10000, method: "CARD", createdAt: d("2026-10-05T08:00:00Z") }],
  });

  it("Oct 1 (as reported on Oct 1): +$100 value, $0 collected, $100 outstanding", () => {
    const asOfOct1 = { ...oct1Sale, payments: [] };
    const r = calculateReports({ sales: [asOfOct1], periodPayments: [], expenses: [] });
    expect(r.serviceValueCents).toBe(10000);
    expect(r.collectedRevenueCents).toBe(0);
    expect(r.outstandingCents).toBe(10000);
  });

  it("Oct 5: +$100 collected without any new service value", () => {
    const r = calculateReports({ sales: [], periodPayments: oct1Sale.payments, expenses: [] });
    expect(r.serviceValueCents).toBe(0);
    expect(r.collectedRevenueCents).toBe(10000);
    expect(r.paymentBreakdown.CARD).toBe(10000);
  });

  it("Oct 1 re-run after the payment: outstanding for Oct 1 sales drops to $0", () => {
    const r = calculateReports({ sales: [oct1Sale], periodPayments: [], expenses: [] });
    expect(r.outstandingCents).toBe(0);
    expect(r.collectedRevenueCents).toBe(0);
  });
});

describe("monthly report", () => {
  it("aggregates many days and expenses", () => {
    const sales: ReportSale[] = [];
    for (let day = 1; day <= 30; day++) {
      const at = d(`2026-10-${String(day).padStart(2, "0")}T10:00:00Z`);
      sales.push(
        sale({
          id: `m${day}`,
          clientId: `c${day % 7}`,
          createdAt: at,
          items: [item("Manicure", 1000, 2, 200)],
          payments: day % 5 === 0 ? [] : [{ amountCents: 2000, method: day % 2 ? "CASH" : "CARD", createdAt: at }],
        }),
      );
    }
    const periodPayments = sales.flatMap((s) => s.payments);
    const r = calculateReports({
      sales,
      periodPayments,
      expenses: [
        { amountCents: 100000, category: "RENT" },
        { amountCents: 5000, category: "ELECTRICITY" },
      ],
    });
    expect(r.serviceValueCents).toBe(60000);
    expect(r.collectedRevenueCents).toBe(48000);
    expect(r.outstandingCents).toBe(12000);
    expect(r.servicesCount).toBe(60);
    expect(r.clientsCount).toBe(7);
    expect(r.expensesCents).toBe(105000);
    expect(r.expensesByCategory.RENT).toBe(100000);
    expect(r.estimatedCashProfitCents).toBe(48000 - 12000 - 105000);
    expect(r.paymentStatus.UNPAID.count).toBe(6);
  });
});

describe("service metrics", () => {
  it("spreads discount and payments across lines", () => {
    const discounted = sale({
      id: "x",
      items: [item("Manicure", 1000, 1, 200), item("Pedicure", 1500, 1, 300)],
      discountCents: 500,
      payments: [{ amountCents: 1000, method: "CASH", createdAt: d("2026-10-01T10:00:00Z") }],
    });
    const metrics = calculateServiceMetrics([discounted, maria]);
    const pedicure = metrics.find((m) => m.name === "Pedicure")!;
    const manicure = metrics.find((m) => m.name === "Manicure")!;
    expect(manicure.serviceValueCents + pedicure.serviceValueCents).toBeGreaterThan(0);
    // Discounted sale: 2000 total split 800/1200; payments 1000 split 400/600.
    expect(manicure).toMatchObject({ quantity: 1, serviceValueCents: 800, collectedCents: 400, outstandingCents: 400 });
    // Pedicure appears in both sales: 1200 + 1500 value; 600 + (2000*1500/3500≈857) collected
    expect(pedicure.quantity).toBe(2);
    expect(pedicure.serviceValueCents).toBe(2700);
    expect(pedicure.collectedCents).toBe(600 + 857);
    expect(pedicure.estimatedCostCents).toBe(600);
    expect(pedicure.estimatedGrossProfitCents).toBe(pedicure.collectedCents - 600);
    const total = metrics.reduce((s, m) => s + m.serviceValueCents, 0);
    expect(total).toBe(discounted.finalTotalCents + maria.finalTotalCents);
  });
});

describe("employee metrics", () => {
  it("computes per-employee totals and commission", () => {
    const sales = [sarah, jessica, maria];
    const periodPayments: PeriodPayment[] = sales.flatMap((s) =>
      s.payments.map((p) => ({ ...p, saleId: s.id, employeeId: s.employeeId })),
    );
    const metrics = calculateEmployeeMetrics(sales, periodPayments, [
      { id: "maya", name: "Maya", commissionType: "PERCENTAGE", commissionValue: 1000 },
      { id: "sara", name: "Sara", commissionType: "FIXED", commissionValue: 300 },
      { id: "emma", name: "Emma", commissionType: "NONE", commissionValue: 0 },
    ]);
    const maya = metrics.find((m) => m.employeeId === "maya")!;
    expect(maya).toMatchObject({
      clientsHandled: 2,
      servicesPerformed: 4,
      serviceValueCents: 6000,
      collectedRevenueCents: 4500,
      outstandingCents: 1500,
      estimatedCommissionCents: 600,
    });
    expect(metrics.find((m) => m.employeeId === "sara")!.estimatedCommissionCents).toBe(300);
    expect(metrics.find((m) => m.employeeId === "emma")!.estimatedCommissionCents).toBeNull();
  });
});

describe("date ranges (salon time zone)", () => {
  const now = d("2026-10-02T21:30:00Z"); // 00:30 on Oct 3 in Beirut (UTC+3)

  it("today follows the salon's local day", () => {
    const r = resolveDateRange("today", TZ, { now });
    expect(r.fromDay).toBe("2026-10-03");
    expect(r.start.toISOString()).toBe("2026-10-02T21:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-03T21:00:00.000Z");
  });

  it("this month / last month", () => {
    const m = resolveDateRange("month", TZ, { now });
    expect([m.fromDay, m.toDay]).toEqual(["2026-10-01", "2026-10-31"]);
    const lm = resolveDateRange("lastMonth", TZ, { now });
    expect([lm.fromDay, lm.toDay]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("week starts Monday; 7 days includes today", () => {
    const w = resolveDateRange("week", TZ, { now });
    expect([w.fromDay, w.toDay]).toEqual(["2026-09-28", "2026-10-04"]);
    const s = resolveDateRange("7d", TZ, { now });
    expect([s.fromDay, s.toDay]).toEqual(["2026-09-27", "2026-10-03"]);
  });

  it("custom range is inclusive and tolerates reversed input", () => {
    const c = resolveDateRange("custom", TZ, { now, from: "2026-10-01", to: "2026-10-05" });
    expect([c.fromDay, c.toDay]).toEqual(["2026-10-01", "2026-10-05"]);
    const bad = resolveDateRange("custom", TZ, { now, from: "2026-10-05", to: "2026-10-01" });
    expect([bad.fromDay, bad.toDay]).toEqual(["2026-10-05", "2026-10-05"]);
  });

  it("daily series buckets by local day", () => {
    const r = resolveDateRange("custom", TZ, { now, from: "2026-10-01", to: "2026-10-02" });
    const series = calculateDailySeries(
      [sale({ id: "late-night", createdAt: d("2026-10-01T22:00:00Z"), items: [item("Haircut", 2500)] })],
      [],
      ["2026-10-01", "2026-10-02"],
      (date) => dayKey(date, TZ),
    );
    expect(r.fromDay).toBe("2026-10-01");
    // 22:00Z on Oct 1 is 01:00 on Oct 2 in Beirut.
    expect(series).toEqual([
      { day: "2026-10-01", serviceValueCents: 0, collectedCents: 0 },
      { day: "2026-10-02", serviceValueCents: 2500, collectedCents: 0 },
    ]);
  });
});
