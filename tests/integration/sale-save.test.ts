import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFixture, prisma, resetDb } from "./helpers";
import { createSale } from "@/server/services/sales";
import { getTodaySnapshot } from "@/server/services/home";
import type { CreateSaleInput } from "@/lib/validation/sale";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const paidManicure = (key?: string): CreateSaleInput => ({
  clientId: f.clients.sarah.id,
  employeeId: f.employee.id,
  items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
  paymentStatus: "PAID",
  paymentMethod: "CASH",
  idempotencyKey: key,
});

describe("Complete Sale save behaviour", () => {
  it("a repeated submission with the same key returns the original sale instead of a duplicate", async () => {
    const first = await createSale(f.ctx, paidManicure("attempt-0001-abcdef"));
    const again = await createSale(f.ctx, paidManicure("attempt-0001-abcdef"));
    expect(first.duplicate).toBe(false);
    expect(again).toEqual({ ...first, duplicate: true });
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("rapid concurrent taps with the same key create exactly one sale and one payment", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => createSale(f.ctx, paidManicure("attempt-burst-123456"))));
    expect(new Set(results.map((r) => r.saleId)).size).toBe(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("a duplicate with a new client does not create a second client either", async () => {
    const input: CreateSaleInput = {
      newClient: { firstName: "Rania", phone: "+961 70 000 111" },
      items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
      paymentStatus: "UNPAID",
      idempotencyKey: "attempt-newclient-01",
    };
    await Promise.all([createSale(f.ctx, input), createSale(f.ctx, input), createSale(f.ctx, input)]);
    expect(await prisma.client.count({ where: { firstName: "Rania" } })).toBe(1);
    expect(await prisma.sale.count()).toBe(1);
  });

  it("different keys are different sales (two real clients with identical services)", async () => {
    await createSale(f.ctx, paidManicure("attempt-a-00000001"));
    await createSale(f.ctx, paidManicure("attempt-b-00000002"));
    expect(await prisma.sale.count()).toBe(2);
  });

  it("a failed attempt saves nothing, so retrying with the same key after fixing it works", async () => {
    const key = "attempt-retry-000001";
    await expect(createSale(f.ctx, { ...paidManicure(key), paymentMethod: null })).rejects.toThrow(/payment method/);
    expect(await prisma.sale.count()).toBe(0);
    const ok = await createSale(f.ctx, paidManicure(key));
    expect(ok.duplicate).toBe(false);
    expect(await prisma.sale.count()).toBe(1);
  });

  it("keys are scoped per salon", async () => {
    const other = await createFixture("Other Salon");
    await createSale(f.ctx, paidManicure("shared-key-0000001"));
    const theirs = await createSale(other.ctx, {
      clientId: other.clients.sarah.id,
      items: [{ serviceId: other.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      idempotencyKey: "shared-key-0000001",
    });
    expect(theirs.duplicate).toBe(false);
    expect(await prisma.sale.count()).toBe(2);
  });

  it("rejects malformed keys and still validates everything server-side", async () => {
    await expect(createSale(f.ctx, paidManicure("bad key with spaces"))).rejects.toThrow();
    await expect(createSale(f.ctx, paidManicure("short"))).rejects.toThrow();
    // client-sent totals are still ignored; price comes from the database
    const s = await createSale(f.ctx, { ...paidManicure("attempt-tamper-0001"), ...({ finalTotalCents: 1 } as object) });
    expect(s.finalTotalCents).toBe(1000);
  });

  it("returns a Today snapshot that already includes the new sale", async () => {
    const before = await getTodaySnapshot(f.ctx);
    const s = await createSale(f.ctx, paidManicure("attempt-snap-000001"));
    const after = await getTodaySnapshot(f.ctx);
    expect(after.serviceValueCents - before.serviceValueCents).toBe(1000);
    expect(after.collectedRevenueCents - before.collectedRevenueCents).toBe(1000);
    expect(after.salesCount).toBe(before.salesCount + 1);
    expect(after.recent[0].id).toBe(s.saleId);
  });
});
