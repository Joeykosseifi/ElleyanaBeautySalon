import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { createFixture, prisma, resetDb } from "./helpers";
import { addPayment, createSale, getSale } from "@/server/services/sales";
import { getClientBalance, getClientProfile, listOutstanding } from "@/server/services/clients";
import { getFullReport, getSummary } from "@/server/services/reports";
import { upsertService } from "@/server/services/catalog";
import { resolveDateRange } from "@/lib/domain/date-range";
import { DomainError } from "@/server/errors";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const today = () => resolveDateRange("today", "Asia/Beirut");

describe("Acceptance 58 — paid client", () => {
  it("records a fully paid sale and updates every figure", async () => {
    const before = await getSummary(f.ctx, today());
    const sale = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      employeeId: f.employee.id,
      items: [
        { serviceId: f.services.manicure.id, quantity: 1 },
        { serviceId: f.services.pedicure.id, quantity: 1 },
      ],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    expect(sale).toMatchObject({ finalTotalCents: 2500, amountPaidCents: 2500, remainingCents: 0, paymentStatus: "PAID" });
    expect(sale.number).toBeGreaterThanOrEqual(1001);

    const after = await getSummary(f.ctx, today());
    expect(after.serviceValueCents - before.serviceValueCents).toBe(2500);
    expect(after.collectedRevenueCents - before.collectedRevenueCents).toBe(2500);
    expect(after.outstandingCents - before.outstandingCents).toBe(0);
    expect(after.servicesCount - before.servicesCount).toBe(2);
    expect(after.paymentBreakdown.CASH).toBe(2500);

    const payments = await prisma.payment.findMany({ where: { saleId: sale.saleId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountCents: 2500, method: "CASH", clientId: f.clients.sarah.id });

    const profile = await getClientProfile(f.ctx, f.clients.sarah.id);
    expect(profile!.totals).toMatchObject({ visits: 1, services: 2, serviceValueCents: 2500, paidCents: 2500, outstandingCents: 0 });
  });
});

describe("Acceptance 59 — unpaid client", () => {
  it("counts service value but not collected revenue", async () => {
    const sale = await createSale(f.ctx, {
      clientId: f.clients.jessica.id,
      items: [{ serviceId: f.services.color.id, quantity: 1 }],
      paymentStatus: "UNPAID",
      amountPaidCents: 999, // ignored for UNPAID
    });
    expect(sale).toMatchObject({ finalTotalCents: 5000, amountPaidCents: 0, remainingCents: 5000, paymentStatus: "UNPAID" });
    expect(await prisma.payment.count({ where: { saleId: sale.saleId } })).toBe(0);

    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({ serviceValueCents: 5000, collectedRevenueCents: 0, outstandingCents: 5000 });
    expect(r.summary.paymentStatus.UNPAID).toEqual({ count: 1, valueCents: 5000 });
    expect(r.services.find((s) => s.name === "Hair Color")!.quantity).toBe(1);
    expect(await getClientBalance(f.ctx, f.clients.jessica.id)).toBe(5000);
  });
});

describe("Acceptance 60 & 61 — partial payment, then pay the rest", () => {
  it("tracks the balance and transitions PARTIAL → PAID", async () => {
    const sale = await createSale(f.ctx, {
      clientId: f.clients.maria.id,
      items: [
        { serviceId: f.services.gel.id, quantity: 1 },
        { serviceId: f.services.pedicure.id, quantity: 1 },
      ],
      paymentStatus: "PARTIAL",
      amountPaidCents: 2000,
      paymentMethod: "CASH",
    });
    expect(sale).toMatchObject({ finalTotalCents: 3500, amountPaidCents: 2000, remainingCents: 1500, paymentStatus: "PARTIAL" });
    expect(await getClientBalance(f.ctx, f.clients.maria.id)).toBe(1500);

    // Move the sale to a previous day so we can check the payment-date rule.
    const serviceDate = addDays(new Date(), -3);
    await prisma.sale.update({ where: { id: sale.saleId }, data: { createdAt: serviceDate } });
    await prisma.payment.updateMany({ where: { saleId: sale.saleId }, data: { createdAt: serviceDate } });

    const result = await addPayment(f.ctx, { saleId: sale.saleId, amountCents: 1500, method: "CARD" });
    expect(result).toMatchObject({ amountPaidCents: 3500, remainingCents: 0, paymentStatus: "PAID" });

    const detail = await getSale(f.ctx, sale.saleId);
    expect(detail!.payments.map((p) => [p.amountCents, p.method])).toEqual([
      [2000, "CASH"],
      [1500, "CARD"],
    ]);
    expect(detail!.paymentStatus).toBe("PAID");
    expect(detail!.createdAt.getTime()).toBe(serviceDate.getTime()); // service date untouched
    expect(await getClientBalance(f.ctx, f.clients.maria.id)).toBe(0);

    // Today: +$15 collected, no new service value.
    const t = await getSummary(f.ctx, today());
    expect(t).toMatchObject({ serviceValueCents: 0, collectedRevenueCents: 1500 });
    expect(t.paymentBreakdown.CARD).toBe(1500);

    // The service day: $35 value, $20 collected that day, nothing outstanding any more.
    const day = resolveDateRange("today", "Asia/Beirut", { now: serviceDate });
    const serviceDay = await getSummary(f.ctx, day);
    expect(serviceDay).toMatchObject({ serviceValueCents: 3500, collectedRevenueCents: 2000, outstandingCents: 0 });
  });

  it("UNPAID → PARTIAL → PAID with append-only history", async () => {
    const sale = await createSale(f.ctx, {
      clientId: f.clients.jessica.id,
      items: [{ serviceId: f.services.color.id, quantity: 1 }],
      paymentStatus: "UNPAID",
    });
    const p1 = await addPayment(f.ctx, { saleId: sale.saleId, amountCents: 3000, method: "CASH" });
    expect(p1).toMatchObject({ paymentStatus: "PARTIAL", remainingCents: 2000 });
    expect((await prisma.sale.findUnique({ where: { id: sale.saleId } }))!.paymentStatus).toBe("PARTIAL");
    const p2 = await addPayment(f.ctx, { saleId: sale.saleId, amountCents: 2000, method: "CARD" });
    expect(p2).toMatchObject({ paymentStatus: "PAID", remainingCents: 0 });
    expect(await prisma.payment.count({ where: { saleId: sale.saleId } })).toBe(2);
    expect((await listOutstanding(f.ctx)).totalCents).toBe(0);
  });
});

describe("validation", () => {
  const base = () => ({ clientId: f.clients.sarah.id, items: [{ serviceId: f.services.manicure.id, quantity: 1 }] });

  it("requires at least one service", async () => {
    await expect(createSale(f.ctx, { ...base(), items: [], paymentStatus: "PAID", paymentMethod: "CASH" })).rejects.toThrow();
  });

  it("requires a payment method when money is received", async () => {
    await expect(createSale(f.ctx, { ...base(), paymentStatus: "PAID" })).rejects.toThrow(DomainError);
  });

  it("requires a client for unpaid / partial sales (walk-ins must be identified)", async () => {
    await expect(
      createSale(f.ctx, { items: base().items, paymentStatus: "UNPAID" }),
    ).rejects.toThrow(/client name/);
    // …but creating the client on the fly works
    const s = await createSale(f.ctx, {
      items: base().items,
      newClient: { firstName: "Walk-in Rania", phone: "+961 70 000 000" },
      paymentStatus: "UNPAID",
    });
    expect(s.clientName).toBe("Walk-in Rania");
  });

  it("allows paid walk-ins", async () => {
    const s = await createSale(f.ctx, { items: base().items, paymentStatus: "PAID", paymentMethod: "CASH" });
    expect(s.clientName).toBe("Walk-in Client");
  });

  it("rejects partial amounts that are zero, negative or the full total", async () => {
    for (const amountPaidCents of [0, 1000, 5000]) {
      await expect(
        createSale(f.ctx, { ...base(), paymentStatus: "PARTIAL", amountPaidCents, paymentMethod: "CASH" }),
      ).rejects.toThrow();
    }
    await expect(
      createSale(f.ctx, { ...base(), paymentStatus: "PARTIAL", amountPaidCents: -1, paymentMethod: "CASH" }),
    ).rejects.toThrow();
  });

  it("rejects overpayment and negative payments", async () => {
    const s = await createSale(f.ctx, { ...base(), paymentStatus: "UNPAID" });
    await expect(addPayment(f.ctx, { saleId: s.saleId, amountCents: 1001, method: "CASH" })).rejects.toThrow(/more than/);
    await expect(addPayment(f.ctx, { saleId: s.saleId, amountCents: -5, method: "CASH" })).rejects.toThrow();
    await addPayment(f.ctx, { saleId: s.saleId, amountCents: 1000, method: "CASH" });
    await expect(addPayment(f.ctx, { saleId: s.saleId, amountCents: 1, method: "CASH" })).rejects.toThrow(/already fully paid/);
  });

  it("prevents concurrent payments from overpaying a sale", async () => {
    const s = await createSale(f.ctx, { ...base(), paymentStatus: "UNPAID" });
    const results = await Promise.allSettled(
      [0, 1, 2].map(() => addPayment(f.ctx, { saleId: s.saleId, amountCents: 1000, method: "CASH" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.payment.count({ where: { saleId: s.saleId } })).toBe(1);
  });

  it("ignores totals from the client and recomputes server-side, with discounts", async () => {
    const s = await createSale(f.ctx, {
      ...base(),
      items: [{ serviceId: f.services.pedicure.id, quantity: 2 }],
      discount: { type: "PERCENTAGE", value: 1000 },
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      // @ts-expect-error — extra fields from a tampered client are stripped
      finalTotalCents: 1,
    });
    expect(s.finalTotalCents).toBe(2700);
    const row = await prisma.sale.findUnique({ where: { id: s.saleId } });
    expect(row).toMatchObject({ subtotalCents: 3000, discountCents: 300, discountType: "PERCENTAGE", finalTotalCents: 2700 });
  });

  it("rejects inactive services", async () => {
    await prisma.service.update({ where: { id: f.services.manicure.id }, data: { active: false } });
    await expect(createSale(f.ctx, { ...base(), paymentStatus: "PAID", paymentMethod: "CASH" })).rejects.toThrow(/no longer active/);
  });
});

describe("price snapshots", () => {
  it("old sales keep their price after the service price changes", async () => {
    const sept = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    await upsertService(f.ctx, f.services.manicure.id, {
      name: "Manicure",
      categoryId: f.services.manicure.categoryId,
      price: "12",
      estimatedCost: "2.50",
      active: "on",
    });
    const oct = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    const [oldSale, newSale] = await Promise.all([getSale(f.ctx, sept.saleId), getSale(f.ctx, oct.saleId)]);
    expect(oldSale!.finalTotalCents).toBe(1000);
    expect(oldSale!.items[0]).toMatchObject({ serviceNameSnapshot: "Manicure", servicePriceSnapshotCents: 1000, serviceCostSnapshotCents: 200 });
    expect(newSale!.finalTotalCents).toBe(1200);
    expect(newSale!.items[0]).toMatchObject({ servicePriceSnapshotCents: 1200, serviceCostSnapshotCents: 250 });
  });
});

describe("tenant isolation", () => {
  it("never reads or writes another salon's data", async () => {
    const other = await createFixture("Other Salon");
    const theirs = await createSale(other.ctx, {
      clientId: other.clients.jessica.id,
      items: [{ serviceId: other.services.color.id, quantity: 1 }],
      paymentStatus: "UNPAID",
    });
    expect(await getSale(f.ctx, theirs.saleId)).toBeNull();
    await expect(addPayment(f.ctx, { saleId: theirs.saleId, amountCents: 100, method: "CASH" })).rejects.toThrow(/not found/);
    await expect(
      createSale(f.ctx, {
        clientId: other.clients.jessica.id,
        items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow(/not found/);
    await expect(
      createSale(f.ctx, {
        clientId: f.clients.sarah.id,
        items: [{ serviceId: other.services.color.id, quantity: 1 }],
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow(/no longer exists/);
    expect((await getSummary(f.ctx, today())).serviceValueCents).toBe(0);
    expect(await getClientProfile(f.ctx, other.clients.jessica.id)).toBeNull();
  });
});

describe("reports", () => {
  it("daily report combines statuses, methods and expenses", async () => {
    const mk = (clientId: string, serviceId: string, status: "PAID" | "PARTIAL" | "UNPAID", amount?: number, method: "CASH" | "CARD" = "CASH") =>
      createSale(f.ctx, {
        clientId,
        employeeId: f.employee.id,
        items: [{ serviceId, quantity: 1 }],
        paymentStatus: status,
        amountPaidCents: amount,
        paymentMethod: status === "UNPAID" ? null : method,
      });
    await mk(f.clients.sarah.id, f.services.manicure.id, "PAID");
    await mk(f.clients.sarah.id, f.services.pedicure.id, "PAID", undefined, "CARD");
    await mk(f.clients.maria.id, f.services.gel.id, "PARTIAL", 500);
    await mk(f.clients.jessica.id, f.services.color.id, "UNPAID");
    await prisma.expense.create({
      data: { salonId: f.salon.id, category: "PRODUCTS", description: "Polish", amountCents: 1000, date: new Date() },
    });

    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({
      serviceValueCents: 9500,
      collectedRevenueCents: 3000,
      outstandingCents: 6500,
      clientsCount: 3,
      servicesCount: 4,
      expensesCents: 1000,
      serviceCostsCents: 200 + 300 + 400 + 1200,
      estimatedCashProfitCents: 3000 - 2100 - 1000,
      potentialRevenueCents: 9500,
    });
    expect(r.summary.paymentBreakdown).toMatchObject({ CASH: 1500, CARD: 1500 });
    expect(r.summary.paymentStatus).toEqual({
      PAID: { count: 2, valueCents: 2500 },
      PARTIAL: { count: 1, valueCents: 2000 },
      UNPAID: { count: 1, valueCents: 5000 },
    });
    expect(r.employees.find((e) => e.employeeId === f.employee.id)).toMatchObject({ servicesPerformed: 4, serviceValueCents: 9500 });
    expect(r.totalOutstandingCents).toBe(6500);

    const outstanding = await listOutstanding(f.ctx);
    expect(outstanding.totalCents).toBe(6500);
    expect(outstanding.clients.map((c) => [c.client.firstName, c.outstandingCents])).toEqual([
      ["Jessica", 5000],
      ["Maria", 1500],
    ]);
  });

  it("monthly report includes earlier days and excludes other months", async () => {
    const s1 = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.color.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    const month = resolveDateRange("month", "Asia/Beirut");
    const lastMonthDate = addDays(month.start, -2);
    await prisma.sale.update({ where: { id: s1.saleId }, data: { createdAt: lastMonthDate } });
    await prisma.payment.updateMany({ where: { saleId: s1.saleId }, data: { createdAt: lastMonthDate } });
    await createSale(f.ctx, {
      clientId: f.clients.maria.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 3 }],
      paymentStatus: "PAID",
      paymentMethod: "CARD",
    });
    const thisMonth = await getSummary(f.ctx, month);
    expect(thisMonth).toMatchObject({ serviceValueCents: 3000, collectedRevenueCents: 3000, servicesCount: 3 });
    const prev = await getSummary(f.ctx, resolveDateRange("lastMonth", "Asia/Beirut"));
    expect(prev).toMatchObject({ serviceValueCents: 5000, collectedRevenueCents: 5000, servicesCount: 1 });
  });
});
