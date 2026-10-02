import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { ServiceContext } from "../context";
import { NotFoundError } from "../errors";
import { clientInputSchema, type ClientInput } from "@/lib/validation/client";
import { listSales } from "./sales";

export interface ClientOption {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

function searchWhere(ctx: ServiceContext, q?: string): Prisma.ClientWhereInput {
  const term = q?.trim();
  if (!term) return { salonId: ctx.salonId };
  const contains = { contains: term, mode: "insensitive" as const };
  const digits = term.replace(/\D/g, "");
  const parts = term.split(/\s+/).filter(Boolean);
  return {
    salonId: ctx.salonId,
    OR: [
      { firstName: contains },
      { lastName: contains },
      { phone: contains },
      ...(digits.length >= 3 && digits !== term ? [{ phone: { contains: digits } }] : []),
      // "Sarah John" => first name + last name
      ...(parts.length > 1
        ? [{ AND: [{ firstName: { contains: parts[0], mode: "insensitive" as const } }, { lastName: { contains: parts.slice(1).join(" "), mode: "insensitive" as const } }] }]
        : []),
    ],
  };
}

/** Fast lookup for the Quick Add client selector (includes what each client owes). */
export async function searchClients(
  ctx: ServiceContext,
  q: string,
  take = 8,
): Promise<(ClientOption & { outstandingCents: number })[]> {
  const clients = await prisma.client.findMany({
    where: searchWhere(ctx, q),
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ updatedAt: "desc" }],
    take,
  });
  const stats = await clientStats(ctx, clients.map((c) => c.id));
  return clients.map((c) => ({ ...c, outstandingCents: stats.get(c.id)?.outstandingCents ?? 0 }));
}

interface ClientStatsRow {
  clientId: string;
  visits: number;
  lastVisit: Date | null;
  serviceValueCents: number;
  outstandingCents: number;
}

/** Visits, last visit and outstanding balance per client, computed from transactions. */
async function clientStats(ctx: ServiceContext, clientIds?: string[]): Promise<Map<string, ClientStatsRow>> {
  if (clientIds && clientIds.length === 0) return new Map();
  const filter = clientIds ? Prisma.sql`AND s."clientId" IN (${Prisma.join(clientIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { clientId: string; visits: bigint; lastVisit: Date | null; serviceValue: bigint | null; outstanding: bigint | null }[]
  >`
    SELECT s."clientId" AS "clientId",
           COUNT(*) AS visits,
           MAX(s."createdAt") AS "lastVisit",
           SUM(s."finalTotalCents") AS "serviceValue",
           SUM(GREATEST(s."finalTotalCents" - COALESCE(p.paid, 0), 0)) AS outstanding
    FROM "Sale" s
    LEFT JOIN (SELECT "saleId", SUM("amountCents") AS paid FROM "Payment" GROUP BY "saleId") p ON p."saleId" = s.id
    WHERE s."salonId" = ${ctx.salonId} AND s."clientId" IS NOT NULL ${filter}
    GROUP BY s."clientId"`;
  return new Map(
    rows.map((r) => [
      r.clientId,
      {
        clientId: r.clientId,
        visits: Number(r.visits),
        lastVisit: r.lastVisit,
        serviceValueCents: Number(r.serviceValue ?? 0),
        outstandingCents: Number(r.outstanding ?? 0),
      },
    ]),
  );
}

export interface ClientListItem extends ClientOption {
  visits: number;
  lastVisit: Date | null;
  outstandingCents: number;
}

export async function listClients(
  ctx: ServiceContext,
  opts: { q?: string; take?: number } = {},
): Promise<ClientListItem[]> {
  const clients = await prisma.client.findMany({
    where: searchWhere(ctx, opts.q),
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: opts.take ?? 500,
  });
  const stats = await clientStats(ctx, clients.map((c) => c.id));
  return clients.map((c) => {
    const s = stats.get(c.id);
    return { ...c, visits: s?.visits ?? 0, lastVisit: s?.lastVisit ?? null, outstandingCents: s?.outstandingCents ?? 0 };
  });
}

export async function getClientProfile(ctx: ServiceContext, clientId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, salonId: ctx.salonId } });
  if (!client) return null;
  const sales = await listSales(ctx, { clientId, take: 1000 });
  const totals = sales.reduce(
    (acc, s) => {
      acc.visits += 1;
      acc.services += s.items.reduce((n, i) => n + i.quantity, 0);
      acc.serviceValueCents += s.finalTotalCents;
      acc.paidCents += s.amountPaidCents;
      acc.outstandingCents += s.remainingCents;
      return acc;
    },
    { visits: 0, services: 0, serviceValueCents: 0, paidCents: 0, outstandingCents: 0 },
  );
  return { client, sales, totals, lastVisit: sales[0]?.createdAt ?? null };
}

export async function createClient(ctx: ServiceContext, raw: ClientInput) {
  const data = clientInputSchema.parse(raw);
  return prisma.client.create({ data: { ...data, salonId: ctx.salonId } });
}

export async function updateClient(ctx: ServiceContext, clientId: string, raw: ClientInput) {
  const data = clientInputSchema.parse(raw);
  const res = await prisma.client.updateMany({ where: { id: clientId, salonId: ctx.salonId }, data });
  if (res.count === 0) throw new NotFoundError("Client");
}

export interface OutstandingClient {
  client: ClientOption;
  outstandingCents: number;
  sales: { id: string; number: number; createdAt: Date; finalTotalCents: number; remainingCents: number }[];
}

/** Everyone who owes money, largest balance first. */
export async function listOutstanding(ctx: ServiceContext): Promise<{ totalCents: number; clients: OutstandingClient[] }> {
  const sales = await listSales(ctx, { status: "OUTSTANDING", take: 5000 });
  const map = new Map<string, OutstandingClient>();
  for (const s of sales) {
    if (s.remainingCents <= 0) continue;
    const key = s.client?.id ?? "walk-in";
    const entry =
      map.get(key) ??
      ({
        client: s.client ?? { id: "walk-in", firstName: "Walk-in Client", lastName: null, phone: null },
        outstandingCents: 0,
        sales: [],
      } satisfies OutstandingClient);
    entry.outstandingCents += s.remainingCents;
    entry.sales.push({
      id: s.id,
      number: s.number,
      createdAt: s.createdAt,
      finalTotalCents: s.finalTotalCents,
      remainingCents: s.remainingCents,
    });
    map.set(key, entry);
  }
  const clients = [...map.values()].sort((a, b) => b.outstandingCents - a.outstandingCents);
  return { totalCents: clients.reduce((s, c) => s + c.outstandingCents, 0), clients };
}

export async function getClientBalance(ctx: ServiceContext, clientId: string): Promise<number> {
  return (await clientStats(ctx, [clientId])).get(clientId)?.outstandingCents ?? 0;
}
