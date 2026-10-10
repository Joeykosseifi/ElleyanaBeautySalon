import { PrismaClient } from "@prisma/client";
import type { ServiceContext } from "@/server/context";

export const prisma = new PrismaClient();

export async function resetDb() {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.service.deleteMany(),
    prisma.category.deleteMany(),
    prisma.client.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.authThrottle.deleteMany(),
    prisma.authSession.deleteMany(),
    prisma.appSetup.deleteMany(),
    prisma.user.deleteMany(),
    prisma.salon.deleteMany(),
  ]);
}

/**
 * A salon with a catalog, an employee and clients. The first fixture also gets the
 * (single) owner login; SalonFlow allows exactly one login account, so extra salons
 * used for isolation tests have none and act with userId null.
 */
export async function createFixture(name = "Test Salon") {
  const salon = await prisma.salon.create({ data: { name, timezone: "Asia/Beirut" } });
  const user =
    (await prisma.user.count()) === 0
      ? await prisma.user.create({
          data: { salonId: salon.id, name: "Maya", email: `${salon.id}@test.local`, passwordHash: "x", role: "OWNER" },
        })
      : null;
  const ctx: ServiceContext = { salonId: salon.id, userId: user?.id ?? null, timezone: salon.timezone, role: "OWNER" };
  const nails = await prisma.category.create({ data: { salonId: salon.id, name: "Nails", sortOrder: 0 } });
  const hair = await prisma.category.create({ data: { salonId: salon.id, name: "Hair", sortOrder: 1 } });
  const svc = async (name: string, categoryId: string, priceCents: number, estimatedCostCents: number) =>
    prisma.service.create({ data: { salonId: salon.id, categoryId, name, priceCents, estimatedCostCents } });
  const services = {
    manicure: await svc("Manicure", nails.id, 1000, 200),
    pedicure: await svc("Pedicure", nails.id, 1500, 300),
    gel: await svc("Gel Polish", nails.id, 2000, 400),
    color: await svc("Hair Color", hair.id, 5000, 1200),
  };
  const employee = await prisma.employee.create({ data: { salonId: salon.id, name: "Maya" } });
  const client = async (firstName: string, lastName: string | null = null) =>
    prisma.client.create({ data: { salonId: salon.id, firstName, lastName } });
  const clients = {
    sarah: await client("Sarah", "Johnson"),
    jessica: await client("Jessica"),
    maria: await client("Maria"),
  };
  return { salon, user, ctx, services, employee, clients };
}
