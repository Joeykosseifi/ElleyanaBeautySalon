import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createFixture, prisma, resetDb } from "./helpers";
import { addPayment, createSale, getSale, voidSale } from "@/server/services/sales";
import { EDIT_CONFLICT, getSaleForEdit, listSaleRevisions, originalTotalCents, updateSale, type SaleForEdit } from "@/server/services/sale-edit";
import { getFullReport } from "@/server/services/reports";
import { getServiceActivity } from "@/server/services/service-activity";
import { getTodaySnapshot } from "@/server/services/home";
import { getClientBalance, listOutstanding } from "@/server/services/clients";
import { resolveDateRange, toLocalDateTimeInput } from "@/lib/domain/date-range";
import type { EditSaleItemInput, UpdateSaleInput } from "@/lib/validation/sale";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let f: Fixture;
const TZ = "Asia/Beirut";

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

/** The edit as the Edit Sale screen would send it if nothing were changed. */
function unchanged(s: SaleForEdit): UpdateSaleInput {
  return {
    saleId: s.id,
    expectedUpdatedAt: s.updatedAt,
    clientId: s.client?.id ?? null,
    items: s.items.map((i) => ({
      kind: "existing" as const,
      itemId: i.id,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      employeeId: i.employeeId,
      ...(i.isCustom ? { name: i.name, estimatedCostCents: i.estimatedCostCents } : {}),
    })),
    discount: s.discount,
    notes: s.notes || null,
    serviceDate: s.serviceDate,
  };
}
const load = async (id: string) => (await getSaleForEdit(f.ctx, id))!;
const existing = (s: SaleForEdit, name: string) => {
  const i = s.items.find((x) => x.name === name)!;
  return { kind: "existing" as const, itemId: i.id, quantity: i.quantity, unitPriceCents: i.unitPriceCents, employeeId: i.employeeId };
};

/** Sarah: Manicure $10 + Pedicure $15 = $25, partially paid $10 cash. */
async function partialSale() {
  const s = await createSale(f.ctx, {
    clientId: f.clients.sarah.id,
    employeeId: f.employee.id,
    items: [
      { serviceId: f.services.manicure.id, quantity: 1 },
      { serviceId: f.services.pedicure.id, quantity: 1 },
    ],
    paymentStatus: "PARTIAL",
    amountPaidCents: 1000,
    paymentMethod: "CASH",
  });
  return load(s.saleId);
}
const today = () => resolveDateRange("today", TZ);
const counts = async () => Object.fromEntries((await getServiceActivity(f.ctx, today())).services.map((s) => [s.name, s.count]));
const paymentsOf = (saleId: string) =>
  prisma.payment.findMany({ where: { saleId }, orderBy: { createdAt: "asc" }, select: { id: true, amountCents: true, method: true, createdAt: true, receivedById: true } });

describe("Edit Sale", () => {
  it("preloads the sale and saving it unchanged changes nothing (no revision)", async () => {
    const s = await partialSale();
    expect(s).toMatchObject({ finalTotalCents: 2500, amountPaidCents: 1000, remainingCents: 1500, paymentStatus: "PARTIAL" });
    expect(s.items.map((i) => [i.name, i.employeeId])).toEqual([["Manicure", f.employee.id], ["Pedicure", f.employee.id]]);
    const r = await updateSale(f.ctx, unchanged(s));
    expect(r).toMatchObject({ changed: false, changes: [] });
    expect(await prisma.saleRevision.count()).toBe(0);
    expect((await load(s.id)).updatedAt).toBe(s.updatedAt);
  });

  it("changes the client to another existing client, a new client, or walk-in; payments follow the sale", async () => {
    const s = await partialSale();
    const before = await paymentsOf(s.id);
    await updateSale(f.ctx, { ...unchanged(s), clientId: f.clients.jessica.id });
    expect((await getSale(f.ctx, s.id))!.client?.firstName).toBe("Jessica");
    expect(await getClientBalance(f.ctx, f.clients.sarah.id)).toBe(0);
    expect(await getClientBalance(f.ctx, f.clients.jessica.id)).toBe(1500);
    const after = await paymentsOf(s.id);
    expect(after).toEqual(before); // amount, method, date, receiver untouched
    expect((await prisma.payment.findFirstOrThrow({ where: { saleId: s.id } })).clientId).toBe(f.clients.jessica.id);

    const s2 = await load(s.id);
    await updateSale(f.ctx, { ...unchanged(s2), clientId: null, newClient: { firstName: "Nour", lastName: "Haddad", phone: "70111222" } });
    expect((await getSale(f.ctx, s.id))!.client).toMatchObject({ firstName: "Nour", lastName: "Haddad" });

    // walk-in is refused while money is owed…
    const s3 = await load(s.id);
    await expect(updateSale(f.ctx, { ...unchanged(s3), clientId: null })).rejects.toThrow(/need a client name/);
  });

  it("adds and removes services; Manicure → Pedicure moves the Services Performed count", async () => {
    const s = await createSale(f.ctx, {
      clientId: f.clients.maria.id,
      employeeId: f.employee.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CARD",
    });
    expect(await counts()).toEqual({ Manicure: 1 });
    const e = await load(s.saleId);
    const r = await updateSale(f.ctx, { ...unchanged(e), items: [{ kind: "catalog", serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents: 1000 }] });
    expect(r.changes).toEqual(expect.arrayContaining(["Removed Manicure ×1", "Added Pedicure ×1 at $10"]));
    expect(await counts()).toEqual({ Pedicure: 1 });
    const items = await prisma.saleItem.findMany({ where: { saleId: s.saleId } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ serviceNameSnapshot: "Pedicure", standardPriceSnapshotCents: 1500, unitPriceChargedCents: 1000, lineTotalCents: 1000 });

    // add two more lines (catalog + custom) and check totals
    const e2 = await load(s.saleId);
    await updateSale(f.ctx, {
      ...unchanged(e2),
      items: [
        ...unchanged(e2).items,
        { kind: "catalog", serviceId: f.services.gel.id, quantity: 2 },
        { kind: "custom", name: "Nail Repair", quantity: 1, unitPriceCents: 800, estimatedCostCents: 100 },
      ],
    });
    const after = await load(s.saleId);
    expect(after.items.map((i) => [i.name, i.quantity, i.unitPriceCents])).toEqual([
      ["Pedicure", 1, 1000],
      ["Gel Polish", 2, 2000],
      ["Nail Repair", 1, 800],
    ]);
    expect(after.finalTotalCents).toBe(1000 + 4000 + 800);
    expect(await counts()).toEqual({ Pedicure: 1, "Gel Polish": 2, "Nail Repair": 1 });
    expect(await prisma.service.count({ where: { name: "Nail Repair" } })).toBe(0); // custom never joins the catalog
  });

  it("edits quantities and charged prices without touching catalog prices", async () => {
    const s = await partialSale();
    const r = await updateSale(f.ctx, {
      ...unchanged(s),
      items: [{ ...existing(s, "Manicure"), quantity: 3 }, { ...existing(s, "Pedicure"), unitPriceCents: 1200 }],
    });
    expect(r.changes).toEqual(expect.arrayContaining(["Manicure: quantity 1 → 3", "Pedicure: price $15 → $12", "Total: $25 → $42"]));
    const after = await load(s.id);
    expect(after).toMatchObject({ finalTotalCents: 4200, remainingCents: 3200, paymentStatus: "PARTIAL" });
    expect(after.items.find((i) => i.name === "Pedicure")).toMatchObject({ standardPriceCents: 1500, unitPriceCents: 1200 });
    expect((await prisma.service.findUniqueOrThrow({ where: { id: f.services.pedicure.id } })).priceCents).toBe(1500);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: f.services.manicure.id } })).priceCents).toBe(1000);
  });

  it("rejects invalid quantities, negative prices and an empty sale", async () => {
    const s = await partialSale();
    const bad: EditSaleItemInput[][] = [
      [{ ...existing(s, "Manicure"), quantity: 0 }],
      [{ ...existing(s, "Manicure"), quantity: 51 }],
      [{ ...existing(s, "Manicure"), quantity: 1.5 }],
      [{ ...existing(s, "Manicure"), unitPriceCents: -100 }],
      [],
    ];
    for (const items of bad) await expect(updateSale(f.ctx, { ...unchanged(s), items })).rejects.toThrow();
    await expect(updateSale(f.ctx, { ...unchanged(s), discount: { type: "PERCENTAGE", value: 10_001 } })).rejects.toThrow();
    expect((await load(s.id)).finalTotalCents).toBe(2500);
  });

  it("changes the employee of each service; employee reports and Services Performed follow", async () => {
    const rita = await prisma.employee.create({ data: { salonId: f.salon.id, name: "Rita", commissionType: "FIXED", commissionValue: 200 } });
    const s = await partialSale();
    await updateSale(f.ctx, { ...unchanged(s), items: [existing(s, "Manicure"), { ...existing(s, "Pedicure"), employeeId: rita.id }] });
    const report = await getFullReport(f.ctx, today());
    const maya = report.employees.find((e) => e.name === "Maya")!;
    const r = report.employees.find((e) => e.name === "Rita")!;
    expect([maya.servicesPerformed, r.servicesPerformed]).toEqual([1, 1]);
    // $25 split by line value: $10 / $15; the $10 paid splits $4 / $6
    expect([maya.serviceValueCents, r.serviceValueCents]).toEqual([1000, 1500]);
    expect([maya.collectedRevenueCents, r.collectedRevenueCents]).toEqual([400, 600]);
    expect([maya.outstandingCents, r.outstandingCents]).toEqual([600, 900]);
    expect(r.estimatedCommissionCents).toBe(200);
    expect(maya.clientsHandled + r.clientsHandled).toBe(2); // the same client counts for each of them
    const activity = await getServiceActivity(f.ctx, today());
    expect(activity.employees.map((e) => [e.name, e.count])).toEqual([["Maya", 1], ["Rita", 1]]);
    expect((await getServiceActivity(f.ctx, { ...today(), employeeId: rita.id })).services.map((x) => x.name)).toEqual(["Pedicure"]);
    // an inactive employee can't be newly assigned
    await prisma.employee.update({ where: { id: rita.id }, data: { active: false } });
    const s2 = await load(s.id);
    await expect(updateSale(f.ctx, { ...unchanged(s2), items: [{ ...existing(s2, "Manicure"), employeeId: rita.id }, existing(s2, "Pedicure")] })).rejects.toThrow(/inactive/);
    // …but a line already assigned to her keeps her
    await expect(updateSale(f.ctx, { ...unchanged(s2), notes: "kept" })).resolves.toMatchObject({ changed: true });
  });

  it("edits custom services (name, price, cost) and adds new ones", async () => {
    const created = await createSale(f.ctx, {
      clientId: f.clients.maria.id,
      items: [{ kind: "custom", name: "Nail Fix", quantity: 1, unitPriceCents: 500, estimatedCostCents: 50 }],
      paymentStatus: "UNPAID",
    });
    const s = await load(created.saleId);
    const fix = s.items[0];
    const r = await updateSale(f.ctx, {
      ...unchanged(s),
      items: [{ kind: "existing", itemId: fix.id, quantity: 2, unitPriceCents: 700, employeeId: null, name: "Nail Repair", estimatedCostCents: 80 }],
    });
    expect(r.changes).toEqual(expect.arrayContaining(["Nail Fix: renamed to Nail Repair", "Nail Fix: quantity 1 → 2", "Nail Fix: price $5 → $7", "Nail Fix: estimated cost $0.50 → $0.80"]));
    const item = await prisma.saleItem.findUniqueOrThrow({ where: { id: fix.id } });
    expect(item).toMatchObject({ isCustom: true, serviceNameSnapshot: "Nail Repair", quantity: 2, unitPriceChargedCents: 700, lineTotalCents: 1400, serviceCostSnapshotCents: 80 });
    expect(await counts()).toEqual({ "Nail Repair": 2 });
  });

  it("edits discounts (add, change type, remove) and recalculates", async () => {
    const s = await partialSale();
    await updateSale(f.ctx, { ...unchanged(s), discount: { type: "FIXED", value: 500 } });
    expect(await load(s.id)).toMatchObject({ subtotalCents: 2500, discountCents: 500, finalTotalCents: 2000, discount: { type: "FIXED", value: 500 } });
    const s2 = await load(s.id);
    const r = await updateSale(f.ctx, { ...unchanged(s2), discount: { type: "PERCENTAGE", value: 2000 } });
    expect(r.changes).toContain("Discount: $5 → 20%");
    expect(await load(s.id)).toMatchObject({ discountCents: 500, finalTotalCents: 2000 });
    const s3 = await load(s.id);
    await updateSale(f.ctx, { ...unchanged(s3), discount: null });
    expect(await load(s.id)).toMatchObject({ discountCents: 0, finalTotalCents: 2500, discount: null });
    // a discount bigger than the subtotal is capped — totals never go negative
    const s4 = await load(s.id);
    await expect(updateSale(f.ctx, { ...unchanged(s4), discount: { type: "FIXED", value: 999_999 } })).rejects.toThrow(/already paid/);
  });

  it("keeps payment history exactly and recalculates Paid / Partially Paid / Unpaid", async () => {
    const s = await partialSale(); // $25, paid $10
    await addPayment(f.ctx, { saleId: s.id, amountCents: 500, method: "WHISH" }); // paid $15
    const history = await paymentsOf(s.id);
    // lower the total to exactly what was paid → PAID
    let e = await load(s.id);
    let r = await updateSale(f.ctx, { ...unchanged(e), items: [existing(e, "Manicure"), { ...existing(e, "Pedicure"), unitPriceCents: 500 }] });
    expect(r).toMatchObject({ finalTotalCents: 1500, amountPaidCents: 1500, remainingCents: 0, paymentStatus: "PAID" });
    // raise it again → PARTIAL
    e = await load(s.id);
    r = await updateSale(f.ctx, { ...unchanged(e), items: [{ ...existing(e, "Manicure"), quantity: 2 }, existing(e, "Pedicure")] });
    expect(r).toMatchObject({ finalTotalCents: 2500, remainingCents: 1000, paymentStatus: "PARTIAL" });
    expect(await paymentsOf(s.id)).toEqual(history);
    expect(await prisma.payment.count()).toBe(2);
    expect((await getSale(f.ctx, s.id))!.paymentStatus).toBe("PARTIAL");
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: s.id } })).paymentStatus).toBe("PARTIAL");
    // an unpaid sale stays unpaid
    const u = await createSale(f.ctx, { clientId: f.clients.maria.id, items: [{ serviceId: f.services.manicure.id, quantity: 1 }], paymentStatus: "UNPAID" });
    const ue = await load(u.saleId);
    expect(await updateSale(f.ctx, { ...unchanged(ue), items: [{ ...existing(ue, "Manicure"), quantity: 2 }] })).toMatchObject({ paymentStatus: "UNPAID", remainingCents: 2000 });
  });

  it("refuses a total below the amount already paid, with a clear message, and changes nothing", async () => {
    const s = await partialSale(); // paid $10
    const before = await prisma.sale.findUniqueOrThrow({ where: { id: s.id }, include: { items: true } });
    await expect(
      updateSale(f.ctx, { ...unchanged(s), items: [{ ...existing(s, "Manicure"), unitPriceCents: 500 }] }),
    ).rejects.toThrow("The client has already paid $10, so the total can't go below that. The new total would be $5.");
    const after = await prisma.sale.findUniqueOrThrow({ where: { id: s.id }, include: { items: true } });
    expect(after).toEqual(before);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.saleRevision.count()).toBe(0);
  });

  it("updates financial reports, Home and outstanding balances consistently", async () => {
    const s = await partialSale(); // $25, paid $10
    const before = await getFullReport(f.ctx, today());
    expect(before.summary).toMatchObject({ serviceValueCents: 2500, collectedRevenueCents: 1000, outstandingCents: 1500, servicesCount: 2 });
    const e = await load(s.id);
    await updateSale(f.ctx, {
      ...unchanged(e),
      items: [existing(e, "Manicure"), { kind: "catalog", serviceId: f.services.color.id, quantity: 1 }],
      discount: { type: "FIXED", value: 1000 },
    });
    // Manicure $10 + Hair Color $50 − $10 = $50; paid $10
    const report = await getFullReport(f.ctx, today());
    expect(report.summary).toMatchObject({ serviceValueCents: 5000, collectedRevenueCents: 1000, outstandingCents: 4000, servicesCount: 2, discountsCents: 1000 });
    expect(report.summary.serviceCostsCents).toBe(200 + 1200);
    expect(report.services.map((x) => [x.name, x.quantity]).sort()).toEqual([["Hair Color", 1], ["Manicure", 1]]);
    const home = await getTodaySnapshot(f.ctx);
    expect(home).toMatchObject({ serviceValueCents: 5000, outstandingCents: 4000, servicesCount: 2 });
    expect((await listOutstanding(f.ctx)).totalCents).toBe(4000);
    expect(await getClientBalance(f.ctx, f.clients.sarah.id)).toBe(4000);
  });

  it("corrects the service date in the salon time zone; date-based reports move with it", async () => {
    const s = await partialSale();
    const yesterday = resolveDateRange("yesterday", TZ);
    const target = toLocalDateTimeInput(new Date(yesterday.start.getTime() + 15 * 3_600_000), TZ); // yesterday 15:00 local
    const r = await updateSale(f.ctx, { ...unchanged(s), serviceDate: target });
    expect(r.changes.some((c) => c.startsWith("Date: "))).toBe(true);
    expect((await getFullReport(f.ctx, today())).summary.servicesCount).toBe(0);
    expect((await getFullReport(f.ctx, yesterday)).summary).toMatchObject({ servicesCount: 2, serviceValueCents: 2500 });
    // the payment keeps its own (today's) date: collected revenue stays today
    expect((await getFullReport(f.ctx, today())).summary.collectedRevenueCents).toBe(1000);
    expect((await getServiceActivity(f.ctx, { start: yesterday.start, end: yesterday.end })).totalServices).toBe(2);
    // the future is refused
    const s2 = await load(s.id);
    const future = toLocalDateTimeInput(new Date(Date.now() + 2 * 86_400_000), TZ);
    await expect(updateSale(f.ctx, { ...unchanged(s2), serviceDate: future })).rejects.toThrow(/future/);
    await expect(updateSale(f.ctx, { ...unchanged(s2), serviceDate: "2026-02-31T10:00" })).rejects.toThrow(/valid date/);
  });

  it("edits notes and records every edit in the history", async () => {
    const s = await partialSale();
    await updateSale(f.ctx, { ...unchanged(s), notes: "Client asked for a lighter shade" });
    expect((await getSale(f.ctx, s.id))!.notes).toBe("Client asked for a lighter shade");
    const revs = await listSaleRevisions(f.ctx, s.id);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ summary: "Notes updated", editedBy: { name: "Maya" } });
    const raw = await prisma.saleRevision.findFirstOrThrow();
    expect(raw.before).toMatchObject({ notes: null, finalTotalCents: 2500 });
    expect(raw.after).toMatchObject({ notes: "Client asked for a lighter shade" });
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: s.id } })).editedAt).not.toBeNull();
    // the History timeline shows the total the sale was created with
    const s2 = await load(s.id);
    await updateSale(f.ctx, { ...unchanged(s2), items: [{ ...existing(s2, "Manicure"), quantity: 3 }, existing(s2, "Pedicure")] });
    expect(originalTotalCents(4500, await listSaleRevisions(f.ctx, s.id))).toBe(2500);
    expect(originalTotalCents(2500, [])).toBe(2500);
  });

  it("only the owner can edit", async () => {
    const s = await partialSale();
    for (const ctx of [{ ...f.ctx, role: "MANAGER" as const }, { ...f.ctx, role: "STAFF" as const }, { ...f.ctx, role: undefined }, { ...f.ctx, userId: null }]) {
      await expect(updateSale(ctx, { ...unchanged(s), notes: "hack" })).rejects.toThrow(/Only the salon owner/);
    }
    // another salon can't even see it
    const other = await createFixture("Other Salon");
    await expect(updateSale({ ...other.ctx, userId: f.user!.id }, { ...unchanged(s), notes: "hack" })).rejects.toThrow(/not found/i);
    expect(await getSaleForEdit(other.ctx, s.id)).toBeNull();
    // ids from another salon are refused
    await expect(updateSale(f.ctx, { ...unchanged(s), clientId: other.clients.sarah.id })).rejects.toThrow(/not found/i);
    await expect(updateSale(f.ctx, { ...unchanged(s), items: [...unchanged(s).items, { kind: "catalog", serviceId: other.services.manicure.id, quantity: 1 }] })).rejects.toThrow(/no longer exists/);
    await expect(updateSale(f.ctx, { ...unchanged(s), items: [{ ...existing(s, "Manicure"), employeeId: other.employee.id }, existing(s, "Pedicure")] })).rejects.toThrow(/not found/i);
    expect((await getSale(f.ctx, s.id))!.notes).toBeNull();
  });

  it("refuses to edit a voided sale", async () => {
    const s = await partialSale();
    await voidSale(f.ctx, { saleId: s.id, reason: "Mistake" });
    const e = await load(s.id);
    expect(e.isVoided).toBe(true);
    await expect(updateSale(f.ctx, { ...unchanged(e), notes: "x" })).rejects.toThrow(/voided/);
  });

  it("refuses stale edits: after another edit, after a payment, and when two edits race", async () => {
    const s = await partialSale();
    // another edit lands first
    await updateSale(f.ctx, { ...unchanged(s), notes: "first" });
    await expect(updateSale(f.ctx, { ...unchanged(s), notes: "second" })).rejects.toThrow(EDIT_CONFLICT);
    // a payment lands after the editor was opened
    const s2 = await load(s.id);
    await addPayment(f.ctx, { saleId: s.id, amountCents: 100, method: "CASH" });
    await expect(updateSale(f.ctx, { ...unchanged(s2), notes: "stale" })).rejects.toThrow(EDIT_CONFLICT);
    // two edits from the same version at the same moment: exactly one wins
    const s3 = await load(s.id);
    const results = await Promise.allSettled([
      updateSale(f.ctx, { ...unchanged(s3), items: [{ ...existing(s3, "Manicure"), quantity: 2 }, existing(s3, "Pedicure")] }),
      updateSale(f.ctx, { ...unchanged(s3), items: [{ ...existing(s3, "Manicure"), quantity: 5 }, existing(s3, "Pedicure")] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toContain("changed somewhere else");
    const q = (await load(s.id)).items.find((i) => i.name === "Manicure")!.quantity;
    expect([2, 5]).toContain(q);
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(2);
  });

  it("keeps lines of services that were later deactivated, but won't add inactive services", async () => {
    const s = await partialSale();
    await prisma.service.update({ where: { id: f.services.pedicure.id }, data: { active: false, priceCents: 9900 } });
    const e = await load(s.id);
    await expect(updateSale(f.ctx, { ...unchanged(e), notes: "still fine" })).resolves.toMatchObject({ changed: true });
    expect((await load(s.id)).items.find((i) => i.name === "Pedicure")).toMatchObject({ standardPriceCents: 1500, unitPriceCents: 1500 });
    const e2 = await load(s.id);
    await expect(
      updateSale(f.ctx, { ...unchanged(e2), items: [...unchanged(e2).items, { kind: "catalog", serviceId: f.services.pedicure.id, quantity: 1 }] }),
    ).rejects.toThrow(/no longer active/);
  });

  it("edits survive a restart (fresh database connection)", async () => {
    const s = await partialSale();
    await updateSale(f.ctx, {
      ...unchanged(s),
      clientId: f.clients.jessica.id,
      items: [{ ...existing(s, "Manicure"), quantity: 2 }, { kind: "custom", name: "Brow Tint", quantity: 1, unitPriceCents: 800 }],
      notes: "edited",
    });
    await prisma.$disconnect();
    const fresh = new PrismaClient();
    try {
      const row = await fresh.sale.findUniqueOrThrow({ where: { id: s.id }, include: { items: { orderBy: { createdAt: "asc" } }, payments: true, revisions: true } });
      expect(row).toMatchObject({ clientId: f.clients.jessica.id, finalTotalCents: 2800, notes: "edited", paymentStatus: "PARTIAL" });
      expect(row.items.map((i) => [i.serviceNameSnapshot, i.quantity])).toEqual([["Manicure", 2], ["Brow Tint", 1]]);
      expect(row.payments.map((p) => p.amountCents)).toEqual([1000]);
      expect(row.revisions).toHaveLength(1);
    } finally {
      await fresh.$disconnect();
    }
  });
});
