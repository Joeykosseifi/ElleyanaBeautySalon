import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { ServiceContext } from "../context";
import { DomainError, NotFoundError } from "../errors";
import { categoryInputSchema, employeeInputSchema, serviceInputSchema } from "@/lib/validation/catalog";

// ---------------------------------------------------------------------------
// Categories & services
// ---------------------------------------------------------------------------

export async function listCatalog(ctx: ServiceContext, opts: { activeOnly?: boolean } = {}) {
  return prisma.category.findMany({
    where: { salonId: ctx.salonId, ...(opts.activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      services: {
        where: opts.activeOnly ? { active: true } : undefined,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });
}

export type CatalogCategory = Awaited<ReturnType<typeof listCatalog>>[number];

function uniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function upsertCategory(ctx: ServiceContext, id: string | null, raw: unknown) {
  const data = categoryInputSchema.parse(raw);
  try {
    if (id) {
      const res = await prisma.category.updateMany({ where: { id, salonId: ctx.salonId }, data });
      if (res.count === 0) throw new NotFoundError("Category");
      return;
    }
    await prisma.category.create({ data: { ...data, salonId: ctx.salonId } });
  } catch (err) {
    if (uniqueViolation(err)) throw new DomainError("A category with this name already exists.", { name: "Already exists." });
    throw err;
  }
}

export async function deleteCategory(ctx: ServiceContext, id: string) {
  const count = await prisma.service.count({ where: { categoryId: id, salonId: ctx.salonId } });
  if (count > 0) throw new DomainError("Move or delete the services in this category first, or mark it inactive.");
  const res = await prisma.category.deleteMany({ where: { id, salonId: ctx.salonId } });
  if (res.count === 0) throw new NotFoundError("Category");
}

export async function upsertService(ctx: ServiceContext, id: string | null, raw: unknown) {
  const input = serviceInputSchema.parse(raw);
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, salonId: ctx.salonId } });
  if (!category) throw new DomainError("Choose a category.", { categoryId: "Choose a category." });
  const data = {
    name: input.name,
    categoryId: input.categoryId,
    priceCents: input.price,
    estimatedCostCents: input.estimatedCost,
    durationMinutes: input.durationMinutes,
    sortOrder: input.sortOrder,
    active: input.active,
    notes: input.notes,
  };
  // Changing a price only affects future sales — sale items keep their snapshots.
  if (id) {
    const res = await prisma.service.updateMany({ where: { id, salonId: ctx.salonId }, data });
    if (res.count === 0) throw new NotFoundError("Service");
    return;
  }
  await prisma.service.create({ data: { ...data, salonId: ctx.salonId } });
}

export async function deleteService(ctx: ServiceContext, id: string) {
  const used = await prisma.saleItem.count({ where: { serviceId: id, sale: { salonId: ctx.salonId } } });
  if (used > 0) {
    // Keep history tidy: deactivate instead of deleting a service that has sales.
    await prisma.service.updateMany({ where: { id, salonId: ctx.salonId }, data: { active: false } });
    return { deactivated: true };
  }
  const res = await prisma.service.deleteMany({ where: { id, salonId: ctx.salonId } });
  if (res.count === 0) throw new NotFoundError("Service");
  return { deactivated: false };
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees(ctx: ServiceContext, opts: { activeOnly?: boolean } = {}) {
  return prisma.employee.findMany({
    where: { salonId: ctx.salonId, ...(opts.activeOnly ? { active: true } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function upsertEmployee(ctx: ServiceContext, id: string | null, raw: unknown) {
  const data = employeeInputSchema.parse(raw);
  if (id) {
    const res = await prisma.employee.updateMany({ where: { id, salonId: ctx.salonId }, data });
    if (res.count === 0) throw new NotFoundError("Employee");
    return;
  }
  await prisma.employee.create({ data: { ...data, salonId: ctx.salonId } });
}
