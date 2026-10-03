import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFixture, prisma, resetDb } from "./helpers";
import { addPayment, createSale, getSale, listSales } from "@/server/services/sales";
import { getClientBalance, getClientProfile } from "@/server/services/clients";
import { getFullReport, getSummary } from "@/server/services/reports";
import { listCatalog } from "@/server/services/catalog";
import { resolveDateRange } from "@/lib/domain/date-range";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const today = () => resolveDateRange("today", "Asia/Beirut");

describe("per-sale price override (Pedicure: standard $15, charged $10)", () => {
  const sellPedicureFor10 = (status: "PAID" | "PARTIAL" | "UNPAID", amountPaidCents?: number) =>
    createSale(f.ctx, {
      clientId: f.clients.maria.id,
      employeeId: f.employee.id,
      items: [{ serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents: 1000 }],
      paymentStatus: status,
      amountPaidCents,
      paymentMethod: status === "UNPAID" ? null : "CASH",
    });

  it("1 & 3 — records the $10 actually charged on the sale item", async () => {
    const sale = await sellPedicureFor10("PAID");
    expect(sale.finalTotalCents).toBe(1000);
    const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.saleId } });
    expect(item).toMatchObject({
      serviceId: f.services.pedicure.id,
      isCustom: false,
      serviceNameSnapshot: "Pedicure",
      standardPriceSnapshotCents: 1500,
      unitPriceChargedCents: 1000,
      serviceCostSnapshotCents: 300,
      quantity: 1,
      lineTotalCents: 1000,
    });
    const row = await prisma.sale.findUniqueOrThrow({ where: { id: sale.saleId } });
    expect(row).toMatchObject({ subtotalCents: 1000, discountCents: 0, finalTotalCents: 1000 });
    expect(await prisma.payment.findFirst({ where: { saleId: sale.saleId } })).toMatchObject({ amountCents: 1000 });
  });

  it("2 — leaves the catalog price at $15 for the next client", async () => {
    await sellPedicureFor10("PAID");
    const service = await prisma.service.findUniqueOrThrow({ where: { id: f.services.pedicure.id } });
    expect(service.priceCents).toBe(1500);
    const catalog = await listCatalog(f.ctx, { activeOnly: true });
    expect(catalog.flatMap((c) => c.services).find((s) => s.name === "Pedicure")!.priceCents).toBe(1500);

    const next = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.pedicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    expect(next.finalTotalCents).toBe(1500);
  });

  it("4 — reports use the $10 charged, not the $15 catalog price", async () => {
    await sellPedicureFor10("PAID");
    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({ serviceValueCents: 1000, collectedRevenueCents: 1000, outstandingCents: 0, servicesCount: 1 });
    expect(r.services.find((s) => s.name === "Pedicure")).toMatchObject({
      quantity: 1,
      serviceValueCents: 1000,
      collectedCents: 1000,
      estimatedCostCents: 300,
      estimatedGrossProfitCents: 700,
    });
    expect(r.employees.find((e) => e.employeeId === f.employee.id)!.serviceValueCents).toBe(1000);
  });

  it("5a — paid uses $10", async () => {
    const s = await sellPedicureFor10("PAID");
    expect(s).toMatchObject({ paymentStatus: "PAID", amountPaidCents: 1000, remainingCents: 0 });
  });

  it("5b — partial uses $10 ($4 paid → $6 remaining; $10 now counts as the full amount)", async () => {
    await expect(sellPedicureFor10("PARTIAL", 1000)).rejects.toThrow(/less than the total/);
    const s = await sellPedicureFor10("PARTIAL", 400);
    expect(s).toMatchObject({ paymentStatus: "PARTIAL", amountPaidCents: 400, remainingCents: 600 });
    expect(await getClientBalance(f.ctx, f.clients.maria.id)).toBe(600);
    await expect(addPayment(f.ctx, { saleId: s.saleId, amountCents: 601, method: "CASH" })).rejects.toThrow(/more than/);
    const done = await addPayment(f.ctx, { saleId: s.saleId, amountCents: 600, method: "CARD" });
    expect(done).toMatchObject({ paymentStatus: "PAID", remainingCents: 0 });
  });

  it("5c — unpaid uses $10 as the outstanding balance", async () => {
    const s = await sellPedicureFor10("UNPAID");
    expect(s).toMatchObject({ paymentStatus: "UNPAID", remainingCents: 1000 });
    expect(await getClientBalance(f.ctx, f.clients.maria.id)).toBe(1000);
    expect((await getSummary(f.ctx, today())).outstandingCents).toBe(1000);
  });

  it("keeps a sale-level discount separate from the override", async () => {
    const s = await createSale(f.ctx, {
      clientId: f.clients.maria.id,
      items: [
        { serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents: 1000 },
        { serviceId: f.services.manicure.id, quantity: 1 },
      ],
      discount: { type: "FIXED", value: 500 },
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    const row = await prisma.sale.findUniqueOrThrow({ where: { id: s.saleId } });
    expect(row).toMatchObject({ subtotalCents: 2000, discountCents: 500, finalTotalCents: 1500 });
  });

  it("supports a complimentary ($0) service: performed, but $0 service value", async () => {
    const s = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [
        { serviceId: f.services.manicure.id, quantity: 1 },
        { serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents: 0 },
      ],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    expect(s.finalTotalCents).toBe(1000);
    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({ servicesCount: 2, serviceValueCents: 1000 });
    expect(r.services.find((m) => m.name === "Pedicure")).toMatchObject({ quantity: 1, serviceValueCents: 0 });

    // An entirely complimentary sale is PAID with no payment record.
    const free = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents: 0 }],
      paymentStatus: "PAID",
    });
    expect(free).toMatchObject({ paymentStatus: "PAID", finalTotalCents: 0 });
    expect(await prisma.payment.count({ where: { saleId: free.saleId } })).toBe(0);
  });

  it("rejects negative or invalid charged prices", async () => {
    for (const unitPriceCents of [-100, 10.5, Number.NaN]) {
      await expect(
        createSale(f.ctx, {
          clientId: f.clients.sarah.id,
          items: [{ serviceId: f.services.pedicure.id, quantity: 1, unitPriceCents }],
          paymentStatus: "PAID",
          paymentMethod: "CASH",
        }),
      ).rejects.toThrow();
    }
    // the database refuses it too
    const sale = await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.pedicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    await expect(
      prisma.saleItem.create({
        data: { saleId: sale.saleId, serviceNameSnapshot: "X", isCustom: true, unitPriceChargedCents: -1, serviceCostSnapshotCents: 0, quantity: 1, lineTotalCents: -1 },
      }),
    ).rejects.toThrow();
  });
});

describe("custom (one-off) services", () => {
  const sellNailRepair = () =>
    createSale(f.ctx, {
      clientId: f.clients.jessica.id,
      employeeId: f.employee.id,
      items: [
        { serviceId: f.services.manicure.id, quantity: 1 },
        { kind: "custom", name: "  Nail Repair  ", unitPriceCents: 800, estimatedCostCents: 100, quantity: 1 },
      ],
      paymentStatus: "PARTIAL",
      amountPaidCents: 1000,
      paymentMethod: "CASH",
    });

  it("6 — stores a custom service with its name and charged price", async () => {
    const s = await sellNailRepair();
    expect(s).toMatchObject({ finalTotalCents: 1800, amountPaidCents: 1000, remainingCents: 800, paymentStatus: "PARTIAL" });
    const custom = await prisma.saleItem.findFirstOrThrow({ where: { saleId: s.saleId, isCustom: true } });
    expect(custom).toMatchObject({
      serviceId: null,
      serviceNameSnapshot: "Nail Repair",
      categoryNameSnapshot: null,
      standardPriceSnapshotCents: null,
      unitPriceChargedCents: 800,
      serviceCostSnapshotCents: 100,
      quantity: 1,
      lineTotalCents: 800,
    });
  });

  it("7 — appears in the client's visit history", async () => {
    await sellNailRepair();
    const profile = await getClientProfile(f.ctx, f.clients.jessica.id);
    expect(profile!.sales).toHaveLength(1);
    expect(profile!.sales[0].items.map((i) => i.serviceNameSnapshot)).toEqual(["Manicure", "Nail Repair"]);
    expect(profile!.totals).toMatchObject({ services: 2, serviceValueCents: 1800, outstandingCents: 800 });
  });

  it("8 — appears in sale details", async () => {
    const s = await sellNailRepair();
    const detail = await getSale(f.ctx, s.saleId);
    const custom = detail!.items.find((i) => i.isCustom)!;
    expect(custom).toMatchObject({ serviceNameSnapshot: "Nail Repair", unitPriceChargedCents: 800, lineTotalCents: 800 });
    // and is searchable on the Sales page
    expect((await listSales(f.ctx, { q: "nail repair" })).map((x) => x.id)).toEqual([s.saleId]);
  });

  it("9 — is NOT added to the permanent Services catalog", async () => {
    const before = await prisma.service.count({ where: { salonId: f.salon.id } });
    await sellNailRepair();
    expect(await prisma.service.count({ where: { salonId: f.salon.id } })).toBe(before);
    expect(await prisma.service.findFirst({ where: { name: { contains: "Nail Repair", mode: "insensitive" } } })).toBeNull();
    const catalog = await listCatalog(f.ctx);
    expect(catalog.flatMap((c) => c.services).some((sv) => sv.name.includes("Nail Repair"))).toBe(false);
  });

  it("is counted in reports at its charged price and grouped as custom", async () => {
    await sellNailRepair();
    const r = await getFullReport(f.ctx, today());
    expect(r.summary).toMatchObject({ serviceValueCents: 1800, servicesCount: 2, serviceCostsCents: 200 + 100 });
    expect(r.services.find((m) => m.name === "Nail Repair")).toMatchObject({ isCustom: true, serviceId: null, quantity: 1, serviceValueCents: 800 });
  });

  it("rejects empty names and missing / negative prices", async () => {
    const attempt = (item: Record<string, unknown>) =>
      createSale(f.ctx, {
        clientId: f.clients.sarah.id,
        // @ts-expect-error — deliberately invalid input
        items: [{ kind: "custom", quantity: 1, ...item }],
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      });
    await expect(attempt({ name: "   ", unitPriceCents: 800 })).rejects.toThrow(/service name/);
    await expect(attempt({ name: "Nail Repair" })).rejects.toThrow();
    await expect(attempt({ name: "Nail Repair", unitPriceCents: -1 })).rejects.toThrow(/negative/);
    await expect(attempt({ name: "Nail Repair", unitPriceCents: 800, estimatedCostCents: -1 })).rejects.toThrow(/negative/);
    expect(await prisma.sale.count()).toBe(0);
  });
});
