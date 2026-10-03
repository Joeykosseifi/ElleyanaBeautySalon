import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { createFixture, prisma, resetDb } from "./helpers";
import { bootstrapOwner } from "@/server/bootstrap";
import { createSale } from "@/server/services/sales";

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const EMAIL = "elleyana@bootstrap.test";
const PASSWORD = "First-Real-Pass-2026";

async function counts() {
  const [salons, users, clients, employees, categories, services, sales, saleItems, payments, expenses] = await Promise.all([
    prisma.salon.count(),
    prisma.user.count(),
    prisma.client.count(),
    prisma.employee.count(),
    prisma.category.count(),
    prisma.service.count(),
    prisma.sale.count(),
    prisma.saleItem.count(),
    prisma.payment.count(),
    prisma.expense.count(),
  ]);
  return { salons, users, clients, employees, categories, services, sales, saleItems, payments, expenses };
}

describe("owner bootstrap (npm run db:seed)", () => {
  it("A — fresh database + valid password: creates only the salon and the owner", async () => {
    const r = await bootstrapOwner(prisma, { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: PASSWORD });
    expect(r).toEqual({ status: "created", ownerEmail: EMAIL, ownerName: "Elleyana", salonName: "Elleyana Beauty Salon", salonCreated: true });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL }, include: { salon: true } });
    expect(owner).toMatchObject({ name: "Elleyana", role: "OWNER", salon: { name: "Elleyana Beauty Salon", timezone: "Asia/Beirut" } });
    expect(await bcrypt.compare(PASSWORD, owner.passwordHash)).toBe(true);
    expect(await counts()).toEqual({
      salons: 1, users: 1, clients: 0, employees: 0, categories: 0, services: 0, sales: 0, saleItems: 0, payments: 0, expenses: 0,
    });
  });

  it("B — fresh owner + missing password: refused, nothing created", async () => {
    const r = await bootstrapOwner(prisma, { SALON_OWNER_EMAIL: EMAIL });
    expect(r.status).toBe("invalid");
    expect(r.status === "invalid" && r.errors.join(" ")).toMatch(/SALON_OWNER_PASSWORD is not set/);
    expect(await counts()).toMatchObject({ salons: 0, users: 0 });
  });

  it("C + D — existing owner, password removed from .env: safe no-op, password and business data unchanged", async () => {
    await bootstrapOwner(prisma, { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: PASSWORD });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    // Real business data entered after setup
    const f = await createFixture("Unrelated Salon");
    await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 1 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    await prisma.client.create({ data: { salonId: owner.salonId, firstName: "Real client" } });
    const before = await counts();
    const ownerBefore = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });

    for (const env of [
      { SALON_OWNER_EMAIL: EMAIL }, // password removed
      { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: "" }, // set but empty
      { SALON_OWNER_EMAIL: ` ${EMAIL.toUpperCase()} `, SALON_OWNER_NAME: "Someone Else" }, // case/space + different name
      { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: "A-Different-Pass-999" }, // a different password is ignored
    ]) {
      expect(await bootstrapOwner(prisma, env)).toEqual({ status: "exists", ownerEmail: EMAIL, salonName: "Elleyana Beauty Salon" });
    }

    const ownerAfter = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(ownerAfter.passwordHash).toBe(ownerBefore.passwordHash);
    expect(ownerAfter.name).toBe("Elleyana");
    expect(ownerAfter.updatedAt.getTime()).toBe(ownerBefore.updatedAt.getTime());
    expect(await bcrypt.compare(PASSWORD, ownerAfter.passwordHash)).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it("E — placeholder and demo credentials are refused for a new account", async () => {
    for (const env of [
      { SALON_OWNER_EMAIL: "owner@example.com", SALON_OWNER_PASSWORD: PASSWORD },
      { SALON_OWNER_EMAIL: "maya@salonflow.com", SALON_OWNER_PASSWORD: PASSWORD },
      { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: "change-me-to-a-strong-password" },
      { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: "salonflow123" },
      { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: "short" },
    ]) {
      const r = await bootstrapOwner(prisma, env);
      expect(r.status).toBe("invalid");
    }
    expect(await counts()).toMatchObject({ salons: 0, users: 0 });
  });

  it("an invalid email is refused even before checking for an existing owner", async () => {
    expect((await bootstrapOwner(prisma, { SALON_OWNER_EMAIL: "not-an-email" })).status).toBe("invalid");
    expect((await bootstrapOwner(prisma, {})).status).toBe("invalid");
  });

  it("a second owner joins the existing Elleyana salon instead of creating another", async () => {
    await bootstrapOwner(prisma, { SALON_OWNER_EMAIL: EMAIL, SALON_OWNER_PASSWORD: PASSWORD });
    const r = await bootstrapOwner(prisma, { SALON_OWNER_EMAIL: "partner@bootstrap.test", SALON_OWNER_PASSWORD: PASSWORD });
    expect(r).toMatchObject({ status: "created", salonCreated: false, salonName: "Elleyana Beauty Salon" });
    expect(await prisma.salon.count()).toBe(1);
  });
});
