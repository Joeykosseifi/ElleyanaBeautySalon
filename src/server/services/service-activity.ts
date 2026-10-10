/**
 * Service Activity: how many times each service was actually performed.
 *
 * Counts come straight from Sale + SaleItem (no extra stored data), aggregated in
 * PostgreSQL so the work stays proportional to the selected period. Rules:
 *
 * - Only active sales count: a voided sale contributes nothing anywhere.
 * - Every service line counts, times its quantity (Manicure ×2 on one sale = 2).
 * - Catalog services are grouped by service; custom ("Other") services by their
 *   name, ignoring case and extra spaces. Custom services stay out of the catalog.
 * - Clients served follows the rest of SalonFlow: unique registered clients plus
 *   each walk-in sale.
 * - Dates are the sale's service date, already resolved to the salon's time zone
 *   by the caller (see resolveDateRange).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { ServiceContext } from "../context";
import { clientDisplayName } from "@/lib/domain/labels";

export const CUSTOM_CATEGORY = "custom";

export interface ActivityFilters {
  start: Date;
  end: Date;
  /** A key from ServiceActivityRow.key */
  serviceKey?: string | null;
  /** A Category id, or CUSTOM_CATEGORY for custom services. */
  categoryId?: string | null;
  employeeId?: string | null;
  paymentStatus?: "PAID" | "PARTIAL" | "UNPAID" | null;
}

export interface ServiceActivityRow {
  key: string;
  name: string;
  category: string | null;
  isCustom: boolean;
  count: number;
}

export interface EmployeeActivityRow {
  employeeId: string | null;
  name: string;
  count: number;
}

export interface ServiceActivity {
  services: ServiceActivityRow[];
  employees: EmployeeActivityRow[];
  totalServices: number;
  differentServices: number;
  clientsServed: number;
  salesCount: number;
}

export interface ServiceActivityEntry {
  saleId: string;
  saleNumber: number;
  performedAt: Date;
  clientName: string;
  isWalkIn: boolean;
  employeeName: string | null;
  quantity: number;
  /** Secondary information only — the price charged for this line. */
  lineTotalCents: number;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
}

/** The grouping key of a sale line — shared by the list, the filter and the detail. */
const KEY_SQL = Prisma.sql`CASE
  WHEN si."isCustom" THEN 'custom:' || lower(btrim(regexp_replace(si."serviceNameSnapshot", '\\s+', ' ', 'g')))
  WHEN si."serviceId" IS NOT NULL THEN 'svc:' || si."serviceId"
  ELSE 'name:' || lower(btrim(regexp_replace(si."serviceNameSnapshot", '\\s+', ' ', 'g')))
END`;

/** FROM + WHERE for the sale lines matching the filters (always salon-scoped, never voided). */
function matchingLines(ctx: ServiceContext, f: ActivityFilters) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s."salonId" = ${ctx.salonId}`,
    Prisma.sql`s."voidedAt" IS NULL`,
    Prisma.sql`s."createdAt" >= ${f.start}`,
    Prisma.sql`s."createdAt" < ${f.end}`,
  ];
  if (f.paymentStatus) conditions.push(Prisma.sql`s."paymentStatus" = ${f.paymentStatus}::"PaymentStatus"`);
  // Each service line has its own employee (a sale can be shared).
  if (f.employeeId) conditions.push(Prisma.sql`si."employeeId" = ${f.employeeId}`);
  if (f.categoryId === CUSTOM_CATEGORY) conditions.push(Prisma.sql`si."isCustom"`);
  else if (f.categoryId) conditions.push(Prisma.sql`NOT si."isCustom" AND sv."categoryId" = ${f.categoryId}`);
  if (f.serviceKey) conditions.push(Prisma.sql`(${KEY_SQL}) = ${f.serviceKey}`);
  return Prisma.sql`FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    LEFT JOIN "Service" sv ON sv.id = si."serviceId" AND sv."salonId" = s."salonId"
    LEFT JOIN "Category" c ON c.id = sv."categoryId"
    LEFT JOIN "Employee" e ON e.id = si."employeeId"
    LEFT JOIN "Client" cl ON cl.id = s."clientId"
    WHERE ${Prisma.join(conditions, " AND ")}`;
}

/** Counts per service, per employee, and the summary figures for the filters. */
export async function getServiceActivity(ctx: ServiceContext, filters: ActivityFilters): Promise<ServiceActivity> {
  const lines = matchingLines(ctx, filters);
  const [services, employees, totals] = await Promise.all([
    prisma.$queryRaw<ServiceActivityRow[]>`
      SELECT ${KEY_SQL} AS key,
        -- catalog: today's catalog name; custom: a capitalised spelling if one was used, else the most recent (spaces tidied)
        COALESCE(MAX(sv.name), (array_agg(btrim(regexp_replace(si."serviceNameSnapshot", '\\s+', ' ', 'g'))
          ORDER BY (si."serviceNameSnapshot" = lower(si."serviceNameSnapshot")), s."createdAt" DESC))[1]) AS name,
        CASE WHEN bool_or(si."isCustom") THEN NULL
             ELSE COALESCE(MAX(c.name), (array_agg(si."categoryNameSnapshot" ORDER BY s."createdAt" DESC))[1]) END AS category,
        bool_or(si."isCustom") AS "isCustom",
        SUM(si.quantity)::int AS count
      ${lines}
      GROUP BY 1`,
    prisma.$queryRaw<{ employeeId: string | null; name: string | null; count: number }[]>`
      SELECT si."employeeId" AS "employeeId", MAX(e.name) AS name, SUM(si.quantity)::int AS count
      ${lines}
      GROUP BY 1`,
    prisma.$queryRaw<{ totalServices: number; clientsServed: number; salesCount: number }[]>`
      SELECT COALESCE(SUM(si.quantity), 0)::int AS "totalServices",
        (COUNT(DISTINCT s."clientId") + COUNT(DISTINCT s.id) FILTER (WHERE s."clientId" IS NULL))::int AS "clientsServed",
        COUNT(DISTINCT s.id)::int AS "salesCount"
      ${lines}`,
  ]);
  const byCount = <T extends { count: number; name: string }>(a: T, b: T) => b.count - a.count || a.name.localeCompare(b.name);
  const t = totals[0] ?? { totalServices: 0, clientsServed: 0, salesCount: 0 };
  return {
    services: services.sort(byCount),
    employees: employees.map((r) => ({ employeeId: r.employeeId, name: r.name ?? "No employee", count: r.count })).sort(byCount),
    totalServices: t.totalServices,
    differentServices: services.length,
    clientsServed: t.clientsServed,
    salesCount: t.salesCount,
  };
}

/** The individual service lines behind a count, in time order (most recent last). */
export async function getServiceActivityEntries(
  ctx: ServiceContext,
  filters: ActivityFilters & { serviceKey: string },
  limit = 500,
): Promise<ServiceActivityEntry[]> {
  const rows = await prisma.$queryRaw<
    {
      saleId: string;
      saleNumber: number;
      performedAt: Date;
      firstName: string | null;
      lastName: string | null;
      employeeName: string | null;
      quantity: number;
      lineTotalCents: number;
      paymentStatus: ServiceActivityEntry["paymentStatus"];
    }[]
  >`
    SELECT s.id AS "saleId", s.number AS "saleNumber", s."createdAt" AS "performedAt",
      cl."firstName" AS "firstName", cl."lastName" AS "lastName", e.name AS "employeeName",
      si.quantity, si."lineTotalCents" AS "lineTotalCents", s."paymentStatus"::text AS "paymentStatus"
    ${matchingLines(ctx, filters)}
    ORDER BY s."createdAt" ASC, si.id ASC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    saleId: r.saleId,
    saleNumber: r.saleNumber,
    performedAt: r.performedAt,
    clientName: clientDisplayName(r.firstName ? { firstName: r.firstName, lastName: r.lastName } : null),
    isWalkIn: !r.firstName,
    employeeName: r.employeeName,
    quantity: r.quantity,
    lineTotalCents: r.lineTotalCents,
    paymentStatus: r.paymentStatus,
  }));
}

/** Options for the filter menus: catalog services (keyed like the activity rows), categories, employees. */
export async function getServiceActivityOptions(ctx: ServiceContext) {
  const [services, categories, employees] = await Promise.all([
    prisma.service.findMany({ where: { salonId: ctx.salonId }, orderBy: [{ name: "asc" }], select: { id: true, name: true } }),
    prisma.category.findMany({ where: { salonId: ctx.salonId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { salonId: ctx.salonId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
  ]);
  return { services: services.map((sv) => ({ key: `svc:${sv.id}`, name: sv.name })), categories, employees };
}
