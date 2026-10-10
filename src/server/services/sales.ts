import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import type { ServiceContext } from "../context";
import { DomainError, NotFoundError } from "../errors";
import { canManage } from "../roles";
import {
  calculateAmountPaid,
  calculatePaymentStatus,
  calculateRemaining,
  calculateSaleTotals,
  resolveCheckoutPayment,
  validateAdditionalPayment,
} from "@/lib/domain/sale-calculations";
import {
  addPaymentSchema,
  createSaleSchema,
  voidSaleSchema,
  type AddPaymentInput,
  type CreateSaleInput,
  type VoidSaleInput,
} from "@/lib/validation/sale";
import { clientDisplayName } from "@/lib/domain/labels";

export const saleListInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  employee: { select: { id: true, name: true } },
  items: { orderBy: { createdAt: "asc" }, include: { employee: { select: { id: true, name: true } } } },
  payments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SaleInclude;

export type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof saleListInclude }>;

export interface CreatedSale {
  saleId: string;
  number: number;
  clientName: string;
  finalTotalCents: number;
  amountPaidCents: number;
  remainingCents: number;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  /** True when this request repeated an attempt that had already been saved. */
  duplicate: boolean;
}

/** Rebuild the Complete Sale result for an already-saved sale (used for duplicate submissions). */
async function existingSaleResult(ctx: ServiceContext, idempotencyKey: string): Promise<CreatedSale | null> {
  const sale = await prisma.sale.findUnique({
    where: { salonId_idempotencyKey: { salonId: ctx.salonId, idempotencyKey } },
    include: { client: { select: { firstName: true, lastName: true } }, payments: { select: { amountCents: true } } },
  });
  if (!sale) return null;
  const paid = calculateAmountPaid(sale.payments);
  return {
    saleId: sale.id,
    number: sale.number,
    clientName: clientDisplayName(sale.client),
    finalTotalCents: sale.finalTotalCents,
    amountPaidCents: paid,
    remainingCents: calculateRemaining(sale.finalTotalCents, paid),
    paymentStatus: calculatePaymentStatus(sale.finalTotalCents, paid),
    duplicate: true,
  };
}

function isIdempotencyConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes("idempotencyKey") : String(target ?? "").includes("idempotencyKey");
}

/**
 * Create a sale from the Quick Add Sale screen.
 *
 * Everything money-related is recomputed here from the database prices — the
 * browser only says which services, how many, the discount, and what was paid.
 */
export async function createSale(ctx: ServiceContext, rawInput: CreateSaleInput): Promise<CreatedSale> {
  const input = createSaleSchema.parse(rawInput);
  const key = input.idempotencyKey ?? null;

  // A repeated submission (double tap, network retry) returns the sale that was already saved.
  if (key) {
    const existing = await existingSaleResult(ctx, key);
    if (existing) return existing;
  }

  try {
    return await insertSale(ctx, input, key);
  } catch (err) {
    // Two identical submissions raced; the unique (salonId, idempotencyKey) index let
    // exactly one commit. Return that one instead of an error.
    if (key && isIdempotencyConflict(err)) {
      const existing = await existingSaleResult(ctx, key);
      if (existing) return existing;
    }
    throw err;
  }
}

function insertSale(
  ctx: ServiceContext,
  input: ReturnType<typeof createSaleSchema.parse>,
  idempotencyKey: string | null,
): Promise<CreatedSale> {
  return prisma.$transaction(async (tx) => {
    // --- Client -----------------------------------------------------------
    let client: { id: string; firstName: string; lastName: string | null } | null = null;
    if (input.clientId) {
      client = await tx.client.findFirst({
        where: { id: input.clientId, salonId: ctx.salonId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!client) throw new NotFoundError("Client");
    } else if (input.newClient) {
      client = await tx.client.create({
        data: { ...input.newClient, salonId: ctx.salonId },
        select: { id: true, firstName: true, lastName: true },
      });
    }

    // --- Employee ---------------------------------------------------------
    if (input.employeeId) {
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, salonId: ctx.salonId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundError("Employee");
    }

    // --- Services & snapshots --------------------------------------------
    // Catalog prices come from the database; the browser may only *override*
    // the price charged for this sale. Custom lines carry their own name/price.
    const catalogIds = [
      ...new Set(input.items.flatMap((it) => (it.kind === "custom" ? [] : [it.serviceId]))),
    ];
    const services = await tx.service.findMany({
      where: { id: { in: catalogIds }, salonId: ctx.salonId },
      include: { category: { select: { name: true } } },
    });
    if (services.length !== catalogIds.length) {
      throw new DomainError("One of the selected services no longer exists. Please refresh and try again.");
    }
    const inactive = services.find((s) => !s.active);
    if (inactive) throw new DomainError(`"${inactive.name}" is no longer active. Please refresh and try again.`);
    const byId = new Map(services.map((s) => [s.id, s]));

    const lines = input.items.map((it) => {
      if (it.kind === "custom") {
        return {
          serviceId: null,
          isCustom: true,
          serviceNameSnapshot: it.name,
          categoryNameSnapshot: null,
          standardPriceSnapshotCents: null,
          unitPriceChargedCents: it.unitPriceCents,
          serviceCostSnapshotCents: it.estimatedCostCents ?? 0,
          quantity: it.quantity,
        };
      }
      const service = byId.get(it.serviceId)!;
      return {
        serviceId: service.id,
        isCustom: false,
        serviceNameSnapshot: service.name,
        categoryNameSnapshot: service.category.name,
        standardPriceSnapshotCents: service.priceCents,
        unitPriceChargedCents: it.unitPriceCents ?? service.priceCents,
        serviceCostSnapshotCents: service.estimatedCostCents,
        quantity: it.quantity,
      };
    });
    const totals = calculateSaleTotals(
      lines.map((l) => ({ unitPriceCents: l.unitPriceChargedCents, quantity: l.quantity })),
      input.discount,
    );

    // --- Payment ------------------------------------------------------------
    const checkout = resolveCheckoutPayment(totals.finalTotalCents, input.paymentStatus, input.amountPaidCents);
    if (!checkout.ok) throw new DomainError(checkout.error, { amountPaidCents: checkout.error });
    const amountPaidCents = checkout.amountCents;
    if (amountPaidCents > 0 && !input.paymentMethod) {
      throw new DomainError("Choose a payment method.", { paymentMethod: "Choose a payment method." });
    }
    const paymentStatus = calculatePaymentStatus(totals.finalTotalCents, amountPaidCents);
    if (paymentStatus !== "PAID" && !client) {
      throw new DomainError(
        "Unpaid and partially paid sales need a client name so you know who owes the balance.",
        { client: "Add the client's name (and ideally phone) for unpaid or partial sales." },
      );
    }

    const sale = await tx.sale.create({
      data: {
        salonId: ctx.salonId,
        clientId: client?.id ?? null,
        employeeId: input.employeeId ?? null,
        createdById: ctx.userId,
        subtotalCents: totals.subtotalCents,
        discountType: totals.discountCents > 0 ? input.discount?.type : null,
        discountValue: totals.discountCents > 0 ? (input.discount?.value ?? 0) : 0,
        discountCents: totals.discountCents,
        finalTotalCents: totals.finalTotalCents,
        paymentStatus,
        notes: input.notes,
        idempotencyKey,
        items: {
          // Quick Add assigns the sale's employee to every service; Edit Sale can change it per line.
          create: lines.map((l) => ({ ...l, lineTotalCents: l.unitPriceChargedCents * l.quantity, employeeId: input.employeeId ?? null })),
        },
        payments:
          amountPaidCents > 0
            ? {
                create: {
                  salonId: ctx.salonId,
                  clientId: client?.id ?? null,
                  receivedById: ctx.userId,
                  amountCents: amountPaidCents,
                  method: input.paymentMethod!,
                },
              }
            : undefined,
      },
      select: { id: true, number: true },
    });

    return {
      saleId: sale.id,
      number: sale.number,
      clientName: clientDisplayName(client),
      finalTotalCents: totals.finalTotalCents,
      amountPaidCents,
      remainingCents: calculateRemaining(totals.finalTotalCents, amountPaidCents),
      paymentStatus,
      duplicate: false,
    };
  });
}

/** Lock the sale row so two simultaneous payments can't both pass the balance check. */
async function lockSale(tx: Tx, ctx: ServiceContext, saleId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Sale" WHERE id = ${saleId} AND "salonId" = ${ctx.salonId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Sale");
}

/**
 * Record a later payment against an unpaid / partially paid sale. Payment history is
 * append-only: every payment is a new record and the sale's status is recalculated.
 */
export async function addPayment(ctx: ServiceContext, rawInput: AddPaymentInput) {
  const input = addPaymentSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    await lockSale(tx, ctx, input.saleId);
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
      include: { payments: { select: { amountCents: true } } },
    });
    if (sale.voidedAt) throw new DomainError("This sale has been voided, so payments can't be added to it.");
    const paidBefore = calculateAmountPaid(sale.payments);
    const check = validateAdditionalPayment(sale.finalTotalCents, paidBefore, input.amountCents);
    if (!check.ok) throw new DomainError(check.error, { amountCents: check.error });

    const payment = await tx.payment.create({
      data: {
        salonId: ctx.salonId,
        saleId: sale.id,
        clientId: sale.clientId,
        receivedById: ctx.userId,
        amountCents: input.amountCents,
        method: input.method,
        notes: input.notes,
      },
    });
    const amountPaidCents = paidBefore + input.amountCents;
    const paymentStatus = calculatePaymentStatus(sale.finalTotalCents, amountPaidCents);
    await tx.sale.update({ where: { id: sale.id }, data: { paymentStatus } });
    return {
      paymentId: payment.id,
      amountPaidCents,
      remainingCents: calculateRemaining(sale.finalTotalCents, amountPaidCents),
      paymentStatus,
    };
  });
}

/**
 * Void a sale entered by mistake. Nothing is deleted: the sale, its items and its
 * payments stay for the audit trail, but every report, balance and summary ignores
 * them from now on. Owner / manager only (enforced by the caller's role check).
 */
export async function voidSale(ctx: ServiceContext, rawInput: VoidSaleInput) {
  const input = voidSaleSchema.parse(rawInput);
  // Defence in depth: the server action checks the role too.
  if (!ctx.userId || !ctx.role || !canManage(ctx.role)) {
    throw new DomainError("Only the salon owner or a manager can void a sale.");
  }
  return prisma.$transaction(async (tx) => {
    await lockSale(tx, ctx, input.saleId);
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: input.saleId }, select: { voidedAt: true, number: true } });
    if (sale.voidedAt) throw new DomainError(`Sale #${sale.number} is already voided.`);
    const voided = await tx.sale.update({
      where: { id: input.saleId },
      data: { voidedAt: new Date(), voidedById: ctx.userId, voidReason: input.reason },
      select: { id: true, number: true, voidedAt: true },
    });
    return voided;
  });
}

export async function getSale(ctx: ServiceContext, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, salonId: ctx.salonId },
    include: {
      ...saleListInclude,
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      payments: { orderBy: { createdAt: "asc" }, include: { receivedBy: { select: { name: true } } } },
    },
  });
  return sale ? withMoney(sale) : null;
}

/** Everyone who performed a service on the sale, in line order (a sale can be shared). */
export function saleEmployeeNames(sale: { employee?: { name: string } | null; items?: { employee?: { name: string } | null }[] }): string[] {
  const names = [...new Set((sale.items ?? []).flatMap((i) => (i.employee ? [i.employee.name] : [])))];
  return names.length ? names : sale.employee ? [sale.employee.name] : [];
}

export function withMoney<T extends { finalTotalCents: number; payments: { amountCents: number }[] }>(sale: T) {
  const amountPaidCents = calculateAmountPaid(sale.payments);
  return {
    ...sale,
    employeeNames: saleEmployeeNames(sale as Parameters<typeof saleEmployeeNames>[0]),
    amountPaidCents,
    remainingCents: calculateRemaining(sale.finalTotalCents, amountPaidCents),
    // Always derived from money so a stale cached status can never be displayed.
    paymentStatus: calculatePaymentStatus(sale.finalTotalCents, amountPaidCents),
    isVoided: "voidedAt" in sale && sale.voidedAt != null,
  };
}

export type SaleView = ReturnType<typeof withMoney<SaleWithRelations>>;

export interface ListSalesOptions {
  start?: Date;
  end?: Date;
  q?: string;
  /** VOIDED lists only voided sales; every other option lists active sales only. */
  status?: "PAID" | "PARTIAL" | "UNPAID" | "OUTSTANDING" | "VOIDED";
  clientId?: string;
  take?: number;
}

export async function listSales(ctx: ServiceContext, opts: ListSalesOptions = {}): Promise<SaleView[]> {
  const q = opts.q?.trim();
  const where: Prisma.SaleWhereInput = {
    salonId: ctx.salonId,
    voidedAt: opts.status === "VOIDED" ? { not: null } : null,
    ...(opts.start || opts.end ? { createdAt: { gte: opts.start, lt: opts.end } } : {}),
    ...(opts.clientId ? { clientId: opts.clientId } : {}),
    ...(opts.status === "VOIDED"
      ? {}
      : opts.status === "OUTSTANDING"
      ? { paymentStatus: { in: ["PARTIAL", "UNPAID"] } }
      : opts.status
        ? { paymentStatus: opts.status }
        : {}),
  };
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    const numeric = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
    where.OR = [
      { client: { is: { firstName: contains } } },
      { client: { is: { lastName: contains } } },
      { client: { is: { phone: contains } } },
      { employee: { is: { name: contains } } },
      { items: { some: { employee: { is: { name: contains } } } } },
      { items: { some: { serviceNameSnapshot: contains } } },
      ...(numeric && numeric < 2_147_483_647 ? [{ number: numeric }] : []),
    ];
    if ("walk-in".includes(q.toLowerCase()) || "walk in".includes(q.toLowerCase())) where.OR.push({ clientId: null });
  }
  const sales = await prisma.sale.findMany({
    where,
    include: saleListInclude,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 300,
  });
  return sales.map(withMoney);
}
