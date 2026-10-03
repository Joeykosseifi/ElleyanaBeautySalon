import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { createFixture, prisma, resetDb } from "./helpers";
import { addPayment, createSale, getSale, listSales, voidSale } from "@/server/services/sales";
import { getClientBalance, getClientProfile, listClients, listOutstanding, searchClients } from "@/server/services/clients";
import { getFullReport, getSummary, getTotalOutstanding } from "@/server/services/reports";
import { getTodaySnapshot } from "@/server/services/home";
import { resolveDateRange } from "@/lib/domain/date-range";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const TZ = "Asia/Beirut";
const today = () => resolveDateRange("today", TZ);
const month = () => resolveDateRange("month", TZ);

/** Every business figure the app shows, gathered in one place so a void can be compared before/after. */
async function everyFigure() {
  const [day, monthReport, totalOutstanding, snapshot, clients, outstanding, search, sales, balance, profile] = await Promise.all([
    getFullReport(f.ctx, today()),
    getFullReport(f.ctx, month()),
    getTotalOutstanding(f.ctx),
    getTodaySnapshot(f.ctx),
    listClients(f.ctx),
    listOutstanding(f.ctx),
    searchClients(f.ctx, "Maria"),
    listSales(f.ctx, { start: today().start, end: today().end }),
    getClientBalance(f.ctx, f.clients.maria.id),
    getClientProfile(f.ctx, f.clients.maria.id),
  ]);
  const maria = clients.find((c) => c.id === f.clients.maria.id)!;
  return {
    summary: day.summary,
    monthSummary: monthReport.summary,
    services: day.services.map((s) => [s.name, s.quantity, s.serviceValueCents, s.collectedCents, s.outstandingCents]),
    employees: day.employees.map((e) => [e.name, e.clientsHandled, e.servicesPerformed, e.serviceValueCents, e.collectedRevenueCents, e.outstandingCents, e.estimatedCommissionCents]),
    daily: monthReport.daily,
    totalOutstanding,
    home: { ...snapshot, recent: snapshot.recent.map((s) => s.id) },
    mariaList: [maria.visits, maria.lastVisit?.toISOString() ?? null, maria.outstandingCents],
    outstanding: [outstanding.totalCents, outstanding.clients.map((c) => [c.client.id, c.outstandingCents])],
    search: search.map((c) => [c.id, c.outstandingCents]),
    salesList: sales.map((s) => s.id),
    mariaBalance: balance,
    mariaProfile: [profile!.totals, profile!.sales.map((s) => s.id), profile!.lastVisit?.toISOString() ?? null],
  };
}

describe("voiding a sale", () => {
  async function baselineSale() {
    // An unrelated active sale so the figures are not all zero.
    await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      employeeId: f.employee.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CARD",
    });
  }

  async function mistakenSale() {
    // Partial sale with a catalog line (price overridden), a custom line, and a later payment.
    const s = await createSale(f.ctx, {
      clientId: f.clients.maria.id,
      employeeId: f.employee.id,
      items: [
        { serviceId: f.services.color.id, quantity: 1, unitPriceCents: 4500 },
        { kind: "custom", name: "Nail Repair", unitPriceCents: 800, estimatedCostCents: 100, quantity: 1 },
      ],
      paymentStatus: "PARTIAL",
      amountPaidCents: 2000,
      paymentMethod: "CASH",
    });
    await addPayment(f.ctx, { saleId: s.saleId, amountCents: 1000, method: "WHISH" });
    return s;
  }

  it("removes the sale and its payments from EVERY business figure, restoring the exact before-state", async () => {
    await baselineSale();
    const before = await everyFigure();

    const s = await mistakenSale();
    const during = await everyFigure();
    // sanity: the mistaken sale really did change the numbers
    expect(during.summary.serviceValueCents).toBe(before.summary.serviceValueCents + 5300);
    expect(during.summary.collectedRevenueCents).toBe(before.summary.collectedRevenueCents + 3000);
    expect(during.mariaBalance).toBe(2300);

    const voided = await voidSale(f.ctx, { saleId: s.saleId, reason: "Entered twice by mistake" });
    expect(voided.voidedAt).toBeInstanceOf(Date);

    const after = await everyFigure();
    expect(after).toEqual(before);
  });

  it("checks each rule explicitly: value, collected, outstanding, profit, counts, balances, employees, services", async () => {
    await baselineSale();
    const s = await mistakenSale();
    await voidSale(f.ctx, { saleId: s.saleId });

    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({
      serviceValueCents: 1000, // only the baseline manicure
      collectedRevenueCents: 1000,
      outstandingCents: 0,
      salesCount: 1,
      servicesCount: 1,
      clientsCount: 1,
      serviceCostsCents: 200,
      estimatedCashProfitCents: 1000 - 200,
      potentialRevenueCents: 1000,
    });
    expect(r.summary.paymentBreakdown).toMatchObject({ CASH: 0, WHISH: 0, CARD: 1000 });
    expect(r.summary.paymentStatus).toEqual({
      PAID: { count: 1, valueCents: 1000 },
      PARTIAL: { count: 0, valueCents: 0 },
      UNPAID: { count: 0, valueCents: 0 },
    });
    expect(r.services.map((m) => m.name)).toEqual(["Manicure"]);
    expect(r.employees.find((e) => e.employeeId === f.employee.id)).toMatchObject({
      salesCount: 1,
      servicesPerformed: 1,
      serviceValueCents: 1000,
      collectedRevenueCents: 1000,
      outstandingCents: 0,
    });
    expect(r.totalOutstandingCents).toBe(0);

    expect(await getClientBalance(f.ctx, f.clients.maria.id)).toBe(0);
    const maria = (await listClients(f.ctx)).find((c) => c.id === f.clients.maria.id)!;
    expect(maria).toMatchObject({ visits: 0, lastVisit: null, outstandingCents: 0 });
    expect((await getClientProfile(f.ctx, f.clients.maria.id))!.totals).toEqual({
      visits: 0,
      services: 0,
      serviceValueCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    });
    expect((await listOutstanding(f.ctx)).clients).toHaveLength(0);

    const home = await getTodaySnapshot(f.ctx);
    expect(home).toMatchObject({ serviceValueCents: 1000, collectedRevenueCents: 1000, outstandingCents: 0, salesCount: 1, servicesCount: 1 });
    expect(home.recent.map((x) => x.id)).not.toContain(s.saleId);
  });

  it("excludes a voided sale's later payment from collected revenue on the payment date", async () => {
    const s = await createSale(f.ctx, {
      clientId: f.clients.jessica.id,
      items: [{ serviceId: f.services.color.id, quantity: 1 }],
      paymentStatus: "UNPAID",
    });
    // Sale happened 3 days ago; the payment is today.
    const serviceDate = addDays(new Date(), -3);
    await prisma.sale.update({ where: { id: s.saleId }, data: { createdAt: serviceDate } });
    await addPayment(f.ctx, { saleId: s.saleId, amountCents: 5000, method: "CASH" });
    expect((await getSummary(f.ctx, today())).collectedRevenueCents).toBe(5000);

    await voidSale(f.ctx, { saleId: s.saleId });
    const todaySummary = await getSummary(f.ctx, today());
    expect(todaySummary.collectedRevenueCents).toBe(0);
    expect(todaySummary.paymentBreakdown.CASH).toBe(0);
    const serviceDay = await getSummary(f.ctx, resolveDateRange("today", TZ, { now: serviceDate }));
    expect(serviceDay).toMatchObject({ serviceValueCents: 0, servicesCount: 0, salesCount: 0, outstandingCents: 0 });
  });

  it("keeps the sale, items and payments for auditing, marked as voided", async () => {
    const s = await mistakenSale();
    await voidSale(f.ctx, { saleId: s.saleId, reason: "  Wrong client  " });

    expect(await prisma.sale.count({ where: { id: s.saleId } })).toBe(1);
    expect(await prisma.saleItem.count({ where: { saleId: s.saleId } })).toBe(2);
    expect(await prisma.payment.count({ where: { saleId: s.saleId } })).toBe(2);

    const detail = await getSale(f.ctx, s.saleId);
    expect(detail).toMatchObject({ isVoided: true, voidReason: "Wrong client", voidedById: f.user.id });
    expect(detail!.voidedBy).toEqual({ name: "Maya" });
    // original money facts are untouched
    expect(detail).toMatchObject({ finalTotalCents: 5300, amountPaidCents: 3000 });

    // Hidden from normal lists, shown under the Voided filter.
    expect((await listSales(f.ctx)).map((x) => x.id)).not.toContain(s.saleId);
    expect((await listSales(f.ctx, { status: "OUTSTANDING" })).map((x) => x.id)).not.toContain(s.saleId);
    expect((await listSales(f.ctx, { q: "Nail Repair" })).map((x) => x.id)).not.toContain(s.saleId);
    expect((await listSales(f.ctx, { status: "VOIDED" })).map((x) => x.id)).toEqual([s.saleId]);
  });

  it("refuses further payments on a voided sale", async () => {
    const s = await mistakenSale();
    await voidSale(f.ctx, { saleId: s.saleId });
    await expect(addPayment(f.ctx, { saleId: s.saleId, amountCents: 100, method: "CASH" })).rejects.toThrow(/voided/);
    expect(await prisma.payment.count({ where: { saleId: s.saleId } })).toBe(2);
  });

  it("cannot void the same sale twice", async () => {
    const s = await mistakenSale();
    await voidSale(f.ctx, { saleId: s.saleId });
    await expect(voidSale(f.ctx, { saleId: s.saleId })).rejects.toThrow(/already voided/);
  });

  it("only owners and managers can void", async () => {
    const s = await mistakenSale();
    await expect(voidSale({ ...f.ctx, role: "STAFF" }, { saleId: s.saleId })).rejects.toThrow(/owner or a manager/);
    await expect(voidSale({ ...f.ctx, role: undefined }, { saleId: s.saleId })).rejects.toThrow(/owner or a manager/);
    const manager = await prisma.user.create({
      data: { salonId: f.salon.id, name: "Manager", email: `mgr-${f.salon.id}@test.local`, passwordHash: "x", role: "MANAGER" },
    });
    await voidSale({ ...f.ctx, userId: manager.id, role: "MANAGER" }, { saleId: s.saleId });
    expect((await getSale(f.ctx, s.saleId))!.voidedBy).toEqual({ name: "Manager" });
  });

  it("cannot void another salon's sale", async () => {
    const other = await createFixture("Other Salon");
    const theirs = await createSale(other.ctx, {
      clientId: other.clients.maria.id,
      items: [{ serviceId: other.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    await expect(voidSale(f.ctx, { saleId: theirs.saleId })).rejects.toThrow(/not found/);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: theirs.saleId } })).voidedAt).toBeNull();
  });

  it("validates the reason and enforces void-field consistency in the database", async () => {
    const s = await mistakenSale();
    await expect(voidSale(f.ctx, { saleId: s.saleId, reason: "x".repeat(301) })).rejects.toThrow();
    // a reason without voidedAt is rejected by the CHECK constraint
    await expect(prisma.sale.update({ where: { id: s.saleId }, data: { voidReason: "sneaky" } })).rejects.toThrow();
  });

  it("price overrides, custom services and $0 services in the remaining active sales are unaffected", async () => {
    const keep = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [
        { serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents: 1000 },
        { serviceId: f.services.manicure.id, quantity: 1, unitPriceCents: 0 },
        { kind: "custom", name: "Nail Repair", unitPriceCents: 800, quantity: 1 },
      ],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    const s = await mistakenSale();
    await voidSale(f.ctx, { saleId: s.saleId });
    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({ serviceValueCents: 1800, collectedRevenueCents: 1800, servicesCount: 3, salesCount: 1 });
    expect(r.services.find((m) => m.name === "Nail Repair")).toMatchObject({ quantity: 1, serviceValueCents: 800 });
    expect(r.services.find((m) => m.name === "Manicure")).toMatchObject({ quantity: 1, serviceValueCents: 0 });
    expect((await getSale(f.ctx, keep.saleId))!.isVoided).toBe(false);
  });
});
