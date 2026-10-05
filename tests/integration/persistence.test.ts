import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma, resetDb } from "./helpers";
import type { ServiceContext } from "@/server/context";
import {
  changeEmail,
  changePassword,
  createAuthSession,
  createInitialOwner,
  revokeAuthSession,
  validateAuthSession,
  verifyCredentials,
} from "@/server/services/auth";
import { updateSalonSettings } from "@/server/services/account";
import { upsertCategory, upsertEmployee, upsertService } from "@/server/services/catalog";
import { createClient } from "@/server/services/clients";
import { createExpense } from "@/server/services/expenses";
import { addPayment, createSale, voidSale } from "@/server/services/sales";

/**
 * Everything the owner enters lives in PostgreSQL: it survives logout, login and a
 * full server restart (a brand-new database connection), with nothing kept in the
 * browser.
 */

const PASSWORD = "Owner-Pass-2026";
let ctx: ServiceContext;
let ids: Record<string, string>;

beforeAll(async () => {
  await resetDb();
  const owner = await createInitialOwner({ name: "Elleyana", email: "owner@salon.test", password: PASSWORD, confirm: PASSWORD });
  ctx = { salonId: owner.salonId, userId: owner.id, timezone: "Asia/Beirut", role: "OWNER" };
  const session = await createAuthSession(owner.id);

  await updateSalonSettings(ctx, { name: "Elleyana Beauty Salon & Spa", timezone: "Asia/Beirut" });
  await upsertCategory(ctx, null, { name: "Brows", sortOrder: 3, active: "on" });
  const category = await prisma.category.findFirstOrThrow({ where: { salonId: ctx.salonId, name: "Brows" } });
  await upsertService(ctx, null, { name: "Brow Lamination", categoryId: category.id, price: "35", estimatedCost: "5", active: "on" });
  const service = await prisma.service.findFirstOrThrow({ where: { salonId: ctx.salonId, name: "Brow Lamination" } });
  await upsertEmployee(ctx, null, { name: "Rita", active: "on", commissionType: "PERCENTAGE", commissionValue: "10" });
  const employee = await prisma.employee.findFirstOrThrow({ where: { salonId: ctx.salonId, name: "Rita" } });
  const client = await createClient(ctx, { firstName: "Nour", lastName: "Haddad", phone: "70123456" });
  const sale = await createSale(ctx, {
    clientId: client.id,
    employeeId: employee.id,
    items: [
      { serviceId: service.id, quantity: 1 },
      { kind: "custom", name: "Brow Tint", unitPriceCents: 1000, estimatedCostCents: 100, quantity: 1 },
    ],
    paymentStatus: "PARTIAL",
    amountPaidCents: 2000,
    paymentMethod: "CASH",
  });
  await addPayment(ctx, { saleId: sale.saleId, amountCents: 500, method: "WHISH" });
  const voided = await createSale(ctx, {
    clientId: client.id,
    employeeId: employee.id,
    items: [{ serviceId: service.id, quantity: 1 }],
    paymentStatus: "PAID",
    paymentMethod: "CARD",
  });
  await voidSale(ctx, { saleId: voided.saleId, reason: "Entered twice" });
  const expense = await createExpense(ctx, { category: "PRODUCTS", description: "Brow tint stock", amount: "42.50", date: "2026-10-01" });
  await changeEmail({ userId: owner.id, sessionId: session.id }, { currentPassword: PASSWORD, newEmail: "elleyana@salon.test" });

  ids = { owner: owner.id, category: category.id, service: service.id, employee: employee.id, client: client.id, sale: sale.saleId, voided: voided.saleId, expense: expense.id, session: session.id };

  // Logout.
  await revokeAuthSession(session.id);
});

afterAll(() => prisma.$disconnect());

async function expectEverythingThere(db: PrismaClient) {
  const salon = await db.salon.findUniqueOrThrow({ where: { id: ctx.salonId } });
  expect(salon.name).toBe("Elleyana Beauty Salon & Spa");
  expect(await db.user.findUniqueOrThrow({ where: { id: ids.owner } })).toMatchObject({ email: "elleyana@salon.test", role: "OWNER" });
  expect(await db.category.findUniqueOrThrow({ where: { id: ids.category } })).toMatchObject({ name: "Brows", sortOrder: 3 });
  expect(await db.service.findUniqueOrThrow({ where: { id: ids.service } })).toMatchObject({ name: "Brow Lamination", priceCents: 3500, estimatedCostCents: 500 });
  expect(await db.employee.findUniqueOrThrow({ where: { id: ids.employee } })).toMatchObject({ name: "Rita", commissionType: "PERCENTAGE", commissionValue: 1000 });
  expect(await db.client.findUniqueOrThrow({ where: { id: ids.client } })).toMatchObject({ firstName: "Nour", lastName: "Haddad" });

  const sale = await db.sale.findUniqueOrThrow({ where: { id: ids.sale }, include: { items: true, payments: true } });
  expect(sale.finalTotalCents).toBe(4500);
  expect(sale.items.map((i) => i.serviceNameSnapshot).sort()).toEqual(["Brow Lamination", "Brow Tint"]);
  expect(sale.payments.map((p) => [p.amountCents, p.method]).sort()).toEqual([[2000, "CASH"], [500, "WHISH"]]);

  const voided = await db.sale.findUniqueOrThrow({ where: { id: ids.voided } });
  expect(voided.voidedAt).not.toBeNull();
  expect(voided).toMatchObject({ voidedById: ids.owner, voidReason: "Entered twice" });

  expect(await db.expense.findUniqueOrThrow({ where: { id: ids.expense } })).toMatchObject({ description: "Brow tint stock", amountCents: 4250, category: "PRODUCTS" });
}

describe("data persistence", () => {
  it("survives logout and login", async () => {
    expect(await validateAuthSession(ids.session, ids.owner)).toBeNull(); // logged out
    const user = await verifyCredentials({ email: "elleyana@salon.test", password: PASSWORD });
    expect(user?.id).toBe(ids.owner);
    await createAuthSession(user!.id);
    await expectEverythingThere(prisma);
  });

  it("survives a server restart (fresh database connection) and a password change", async () => {
    await prisma.$disconnect();
    const restarted = new PrismaClient();
    try {
      await expectEverythingThere(restarted);
    } finally {
      await restarted.$disconnect();
    }
    const s = await createAuthSession(ids.owner);
    await changePassword({ userId: ids.owner, sessionId: s.id }, { currentPassword: PASSWORD, password: "Newer-Pass-2027", confirm: "Newer-Pass-2027" });
    expect(await verifyCredentials({ email: "elleyana@salon.test", password: "Newer-Pass-2027" })).not.toBeNull();
    await expectEverythingThere(prisma);
  });
});
