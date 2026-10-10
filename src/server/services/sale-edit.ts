/**
 * Edit Sale — change an existing sale in place, without voiding and re-entering it.
 *
 * Rules (all enforced here, on the server):
 * - Only the signed-in owner can edit, and never a voided sale.
 * - Everything is recalculated from the lines: subtotal, discount, total, the amount
 *   still owed and the Paid / Partially Paid / Unpaid status.
 * - Payments are history and are never deleted, duplicated or changed in amount,
 *   method or date. If the new total would be LESS than what was already paid, the
 *   edit is refused — SalonFlow never issues refunds automatically.
 * - Lines already on the sale keep their snapshots (catalog name, category, standard
 *   price, cost), so a later catalog change never rewrites history; new catalog
 *   lines snapshot today's catalog. Catalog prices themselves are never changed.
 * - One transaction: the sale row is locked, and the edit is refused if the sale
 *   changed (another edit, a payment, a void) since the editor was opened.
 * - Every saved edit is recorded in SaleRevision with a plain-language summary and
 *   the sale as it was before and after.
 */
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import type { ServiceContext } from "../context";
import { DomainError, NotFoundError } from "../errors";
import {
  calculateAmountPaid,
  calculatePaymentStatus,
  calculateRemaining,
  calculateSaleTotals,
  type PaymentStatus,
} from "@/lib/domain/sale-calculations";
import { updateSaleSchema, type UpdateSaleInput } from "@/lib/validation/sale";
import { clientDisplayName } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/domain/money";
import { formatInZone, fromLocalDateTimeInput, toLocalDateTimeInput } from "@/lib/domain/date-range";

export const EDIT_CONFLICT =
  "This sale was changed somewhere else (another edit or a payment) after you opened it. Reload it to see the latest version, then make your changes again.";

/** Everything the Edit Sale screen needs to preload a sale. */
export async function getSaleForEdit(ctx: ServiceContext, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, salonId: ctx.salonId },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, phone: true } },
      items: { orderBy: { createdAt: "asc" } },
      payments: { select: { amountCents: true } },
    },
  });
  if (!sale) return null;
  const amountPaidCents = calculateAmountPaid(sale.payments);
  return {
    id: sale.id,
    number: sale.number,
    isVoided: sale.voidedAt !== null,
    updatedAt: sale.updatedAt.toISOString(),
    serviceDate: toLocalDateTimeInput(sale.createdAt, ctx.timezone),
    client: sale.client,
    notes: sale.notes ?? "",
    discount: sale.discountType && sale.discountCents > 0 ? { type: sale.discountType, value: sale.discountValue } : null,
    subtotalCents: sale.subtotalCents,
    discountCents: sale.discountCents,
    finalTotalCents: sale.finalTotalCents,
    amountPaidCents,
    remainingCents: calculateRemaining(sale.finalTotalCents, amountPaidCents),
    paymentStatus: sale.paymentStatus,
    items: sale.items.map((i) => ({
      id: i.id,
      serviceId: i.serviceId,
      isCustom: i.isCustom,
      name: i.serviceNameSnapshot,
      category: i.categoryNameSnapshot,
      standardPriceCents: i.standardPriceSnapshotCents,
      unitPriceCents: i.unitPriceChargedCents,
      estimatedCostCents: i.serviceCostSnapshotCents,
      quantity: i.quantity,
      employeeId: i.employeeId,
    })),
  };
}

export type SaleForEdit = NonNullable<Awaited<ReturnType<typeof getSaleForEdit>>>;

export interface UpdatedSale {
  saleId: string;
  number: number;
  changed: boolean;
  changes: string[];
  previousTotalCents: number;
  finalTotalCents: number;
  amountPaidCents: number;
  remainingCents: number;
  paymentStatus: PaymentStatus;
  updatedAt: string;
}

interface LineDraft {
  id?: string;
  serviceId: string | null;
  isCustom: boolean;
  serviceNameSnapshot: string;
  categoryNameSnapshot: string | null;
  standardPriceSnapshotCents: number | null;
  unitPriceChargedCents: number;
  serviceCostSnapshotCents: number;
  quantity: number;
  employeeId: string | null;
}

/** The parts of a sale an edit can change, as stored in SaleRevision.before / after. */
function snapshot(sale: {
  clientId: string | null;
  clientName: string;
  createdAt: Date;
  notes: string | null;
  discountType: string | null;
  discountValue: number;
  subtotalCents: number;
  discountCents: number;
  finalTotalCents: number;
  paymentStatus: string;
  lines: (LineDraft & { employeeName: string | null })[];
}) {
  return {
    client: { id: sale.clientId, name: sale.clientName },
    serviceDate: sale.createdAt.toISOString(),
    notes: sale.notes,
    discount: sale.discountCents > 0 ? { type: sale.discountType, value: sale.discountValue, cents: sale.discountCents } : null,
    subtotalCents: sale.subtotalCents,
    finalTotalCents: sale.finalTotalCents,
    paymentStatus: sale.paymentStatus,
    lines: sale.lines.map((l) => ({
      id: l.id ?? null,
      name: l.serviceNameSnapshot,
      custom: l.isCustom,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceChargedCents,
      lineTotalCents: l.unitPriceChargedCents * l.quantity,
      employee: l.employeeName,
    })),
  };
}

const describeDiscount = (type: string | null, value: number, cents: number) =>
  cents <= 0 ? "none" : type === "PERCENTAGE" ? `${value / 100}%` : formatMoney(cents);

export async function updateSale(ctx: ServiceContext, raw: UpdateSaleInput): Promise<UpdatedSale> {
  // Defence in depth: the server action checks this too.
  if (ctx.role !== "OWNER" || !ctx.userId) throw new DomainError("Only the salon owner can edit sales.");
  const input = updateSaleSchema.parse(raw);

  return prisma.$transaction(async (tx) => {
    // Lock the sale so a concurrent edit or payment waits, then compare versions.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Sale" WHERE id = ${input.saleId} AND "salonId" = ${ctx.salonId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Sale");
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        items: { orderBy: { createdAt: "asc" } },
        payments: { select: { amountCents: true } },
      },
    });
    if (sale.voidedAt) throw new DomainError(`Sale #${sale.number} is voided and can no longer be edited.`);
    if (sale.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new DomainError(EDIT_CONFLICT);

    const employees = await tx.employee.findMany({ where: { salonId: ctx.salonId }, select: { id: true, name: true, active: true } });
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const employeeName = (id: string | null) => (id ? (employeeById.get(id)?.name ?? "Former employee") : null);

    // --- Client --------------------------------------------------------------
    let client: { id: string; firstName: string; lastName: string | null } | null = null;
    if (input.clientId) {
      client =
        input.clientId === sale.clientId
          ? sale.client
          : await tx.client.findFirst({ where: { id: input.clientId, salonId: ctx.salonId }, select: { id: true, firstName: true, lastName: true } });
      if (!client) throw new NotFoundError("Client");
    } else if (input.newClient) {
      client = await tx.client.create({ data: { ...input.newClient, salonId: ctx.salonId }, select: { id: true, firstName: true, lastName: true } });
    }

    // --- Lines ------------------------------------------------------------------
    const existingById = new Map(sale.items.map((i) => [i.id, i]));
    const newCatalogIds = [...new Set(input.items.flatMap((i) => (i.kind !== "existing" && i.kind !== "custom" ? [i.serviceId] : [])))];
    const services = await tx.service.findMany({
      where: { id: { in: newCatalogIds }, salonId: ctx.salonId },
      include: { category: { select: { name: true } } },
    });
    const serviceById = new Map(services.map((s) => [s.id, s]));

    const checkEmployee = (id: string | null | undefined, current: string | null): string | null => {
      if (!id) return null;
      const e = employeeById.get(id);
      if (!e) throw new NotFoundError("Employee");
      if (!e.active && id !== current) throw new DomainError(`${e.name} is inactive and can't be assigned to a service.`);
      return id;
    };

    const lines: LineDraft[] = input.items.map((it) => {
      if (it.kind === "existing") {
        const old = existingById.get(it.itemId);
        if (!old) throw new DomainError("One of the services on this sale no longer exists. Reload the sale and try again.");
        return {
          id: old.id,
          serviceId: old.serviceId,
          isCustom: old.isCustom,
          serviceNameSnapshot: old.isCustom && it.name ? it.name : old.serviceNameSnapshot,
          categoryNameSnapshot: old.categoryNameSnapshot,
          standardPriceSnapshotCents: old.standardPriceSnapshotCents,
          unitPriceChargedCents: it.unitPriceCents,
          serviceCostSnapshotCents: old.isCustom && it.estimatedCostCents != null ? it.estimatedCostCents : old.serviceCostSnapshotCents,
          quantity: it.quantity,
          employeeId: checkEmployee(it.employeeId, old.employeeId),
        };
      }
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
          employeeId: checkEmployee(it.employeeId, null),
        };
      }
      const service = serviceById.get(it.serviceId);
      if (!service) throw new DomainError("One of the selected services no longer exists. Please refresh and try again.");
      if (!service.active) throw new DomainError(`"${service.name}" is no longer active, so it can't be added.`);
      return {
        serviceId: service.id,
        isCustom: false,
        serviceNameSnapshot: service.name,
        categoryNameSnapshot: service.category.name,
        standardPriceSnapshotCents: service.priceCents,
        unitPriceChargedCents: it.unitPriceCents ?? service.priceCents,
        serviceCostSnapshotCents: service.estimatedCostCents,
        quantity: it.quantity,
        employeeId: checkEmployee(it.employeeId, null),
      };
    });

    // --- Money -----------------------------------------------------------------
    const totals = calculateSaleTotals(
      lines.map((l) => ({ unitPriceCents: l.unitPriceChargedCents, quantity: l.quantity })),
      input.discount,
    );
    const amountPaidCents = calculateAmountPaid(sale.payments);
    if (totals.finalTotalCents < amountPaidCents) {
      throw new DomainError(
        `The client has already paid ${formatMoney(amountPaidCents)}, so the total can't go below that. ` +
          `The new total would be ${formatMoney(totals.finalTotalCents)}. SalonFlow doesn't refund automatically: ` +
          `keep the total at ${formatMoney(amountPaidCents)} or more, or void this sale and enter it again.`,
        { total: "Total is less than the amount already paid." },
      );
    }
    const paymentStatus = calculatePaymentStatus(totals.finalTotalCents, amountPaidCents);
    if (paymentStatus !== "PAID" && !client) {
      throw new DomainError("Unpaid and partially paid sales need a client name so you know who owes the balance.", {
        client: "Add the client's name for an unpaid or partial sale.",
      });
    }

    // --- Date ------------------------------------------------------------------
    let createdAt = sale.createdAt;
    if (input.serviceDate && input.serviceDate !== toLocalDateTimeInput(sale.createdAt, ctx.timezone)) {
      const parsed = fromLocalDateTimeInput(input.serviceDate, ctx.timezone);
      if (!parsed) throw new DomainError("Choose a valid date and time.", { serviceDate: "Invalid date." });
      if (parsed.getTime() > Date.now() + 5 * 60_000) throw new DomainError("The service date can't be in the future.", { serviceDate: "In the future." });
      if (parsed.getFullYear() < 2000) throw new DomainError("Choose a valid date and time.", { serviceDate: "Invalid date." });
      createdAt = parsed;
    }

    const discountActive = totals.discountCents > 0;
    const next = {
      clientId: client?.id ?? null,
      clientName: clientDisplayName(client),
      createdAt,
      notes: input.notes,
      discountType: discountActive ? (input.discount?.type ?? null) : null,
      discountValue: discountActive ? (input.discount?.value ?? 0) : 0,
      ...totals,
      paymentStatus,
      lines: lines.map((l) => ({ ...l, employeeName: employeeName(l.employeeId) })),
    };
    const prev = {
      clientId: sale.clientId,
      clientName: clientDisplayName(sale.client),
      createdAt: sale.createdAt,
      notes: sale.notes,
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      subtotalCents: sale.subtotalCents,
      discountCents: sale.discountCents,
      finalTotalCents: sale.finalTotalCents,
      paymentStatus: sale.paymentStatus,
      lines: sale.items.map((i) => ({
        id: i.id,
        serviceId: i.serviceId,
        isCustom: i.isCustom,
        serviceNameSnapshot: i.serviceNameSnapshot,
        categoryNameSnapshot: i.categoryNameSnapshot,
        standardPriceSnapshotCents: i.standardPriceSnapshotCents,
        unitPriceChargedCents: i.unitPriceChargedCents,
        serviceCostSnapshotCents: i.serviceCostSnapshotCents,
        quantity: i.quantity,
        employeeId: i.employeeId,
        employeeName: employeeName(i.employeeId),
      })),
    };

    // --- What changed ---------------------------------------------------------------
    const changes: string[] = [];
    if (prev.clientId !== next.clientId) changes.push(`Client: ${prev.clientName} → ${next.clientName}`);
    if (prev.createdAt.getTime() !== next.createdAt.getTime()) {
      const f = (d: Date) => formatInZone(d, "MMM d, yyyy h:mm a", ctx.timezone);
      changes.push(`Date: ${f(prev.createdAt)} → ${f(next.createdAt)}`);
    }
    const keptIds = new Set(lines.flatMap((l) => (l.id ? [l.id] : [])));
    for (const old of prev.lines) {
      if (!keptIds.has(old.id)) changes.push(`Removed ${old.serviceNameSnapshot} ×${old.quantity}`);
    }
    for (const l of next.lines) {
      if (!l.id) {
        changes.push(`Added ${l.serviceNameSnapshot} ×${l.quantity} at ${formatMoney(l.unitPriceChargedCents)}${l.employeeName ? ` (${l.employeeName})` : ""}`);
        continue;
      }
      const old = prev.lines.find((o) => o.id === l.id)!;
      const label = old.serviceNameSnapshot;
      if (old.serviceNameSnapshot !== l.serviceNameSnapshot) changes.push(`${label}: renamed to ${l.serviceNameSnapshot}`);
      if (old.quantity !== l.quantity) changes.push(`${label}: quantity ${old.quantity} → ${l.quantity}`);
      if (old.unitPriceChargedCents !== l.unitPriceChargedCents)
        changes.push(`${label}: price ${formatMoney(old.unitPriceChargedCents)} → ${formatMoney(l.unitPriceChargedCents)}`);
      if (old.serviceCostSnapshotCents !== l.serviceCostSnapshotCents)
        changes.push(`${label}: estimated cost ${formatMoney(old.serviceCostSnapshotCents)} → ${formatMoney(l.serviceCostSnapshotCents)}`);
      if (old.employeeId !== l.employeeId) changes.push(`${label}: employee ${old.employeeName ?? "none"} → ${l.employeeName ?? "none"}`);
    }
    const oldDiscount = describeDiscount(prev.discountType, prev.discountValue, prev.discountCents);
    const newDiscount = describeDiscount(next.discountType, next.discountValue, next.discountCents);
    if (oldDiscount !== newDiscount) changes.push(`Discount: ${oldDiscount} → ${newDiscount}`);
    if ((prev.notes ?? "") !== (next.notes ?? "")) changes.push("Notes updated");
    if (prev.finalTotalCents !== next.finalTotalCents) changes.push(`Total: ${formatMoney(prev.finalTotalCents)} → ${formatMoney(next.finalTotalCents)}`);
    if (prev.paymentStatus !== next.paymentStatus) changes.push(`Status: ${prev.paymentStatus} → ${next.paymentStatus}`);

    const result = (updatedAt: Date, changed: boolean): UpdatedSale => ({
      saleId: sale.id,
      number: sale.number,
      changed,
      changes,
      previousTotalCents: prev.finalTotalCents,
      finalTotalCents: next.finalTotalCents,
      amountPaidCents,
      remainingCents: calculateRemaining(next.finalTotalCents, amountPaidCents),
      paymentStatus,
      updatedAt: updatedAt.toISOString(),
    });
    if (changes.length === 0) return result(sale.updatedAt, false);

    // --- Write (all or nothing) ----------------------------------------------------
    await writeLines(tx, sale.id, sale.items.map((i) => i.id), lines);
    const now = new Date();
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: {
        clientId: next.clientId,
        // The sale-level employee follows the first service (used for display and search).
        employeeId: lines[0]?.employeeId ?? null,
        subtotalCents: next.subtotalCents,
        discountType: (next.discountType as "FIXED" | "PERCENTAGE" | null) ?? null,
        discountValue: next.discountValue,
        discountCents: next.discountCents,
        finalTotalCents: next.finalTotalCents,
        paymentStatus,
        notes: next.notes,
        createdAt: next.createdAt,
        editedAt: now,
      },
      select: { updatedAt: true },
    });
    if (prev.clientId !== next.clientId) {
      // Keep each payment linked to the sale's client. Amounts, methods and dates are untouched.
      await tx.payment.updateMany({ where: { saleId: sale.id }, data: { clientId: next.clientId } });
      changes.push("Existing payments now show under the new client (amounts, methods and dates unchanged)");
    }
    await tx.saleRevision.create({
      data: {
        saleId: sale.id,
        editedById: ctx.userId,
        summary: changes.join("\n"),
        before: snapshot(prev) as Prisma.InputJsonValue,
        after: snapshot(next) as Prisma.InputJsonValue,
      },
    });
    return result(updated.updatedAt, true);
  });
}

/** Remove dropped lines, update kept lines, add new ones. */
async function writeLines(tx: Tx, saleId: string, oldIds: string[], lines: LineDraft[]) {
  const keep = new Set(lines.flatMap((l) => (l.id ? [l.id] : [])));
  const removed = oldIds.filter((id) => !keep.has(id));
  if (removed.length) await tx.saleItem.deleteMany({ where: { saleId, id: { in: removed } } });
  for (const l of lines) {
    const data = {
      serviceId: l.serviceId,
      isCustom: l.isCustom,
      serviceNameSnapshot: l.serviceNameSnapshot,
      categoryNameSnapshot: l.categoryNameSnapshot,
      standardPriceSnapshotCents: l.standardPriceSnapshotCents,
      unitPriceChargedCents: l.unitPriceChargedCents,
      serviceCostSnapshotCents: l.serviceCostSnapshotCents,
      quantity: l.quantity,
      lineTotalCents: l.unitPriceChargedCents * l.quantity,
      employeeId: l.employeeId,
    };
    if (l.id) await tx.saleItem.update({ where: { id: l.id }, data });
    else await tx.saleItem.create({ data: { ...data, saleId } });
  }
}

/** Edit history for the sale page, newest first. */
export async function listSaleRevisions(ctx: ServiceContext, saleId: string) {
  return prisma.saleRevision.findMany({
    where: { saleId, sale: { salonId: ctx.salonId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, summary: true, before: true, editedBy: { select: { name: true } } },
  });
}

/** The total when the sale was first saved (before any edit), for the History timeline. */
export function originalTotalCents(currentTotalCents: number, revisionsNewestFirst: { before: unknown }[]): number {
  const first = revisionsNewestFirst.at(-1)?.before as { finalTotalCents?: unknown } | undefined;
  return typeof first?.finalTotalCents === "number" ? first.finalTotalCents : currentTotalCents;
}
