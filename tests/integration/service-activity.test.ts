import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFixture, prisma, resetDb } from "./helpers";
import { createSale, voidSale } from "@/server/services/sales";
import { getFullReport } from "@/server/services/reports";
import {
  CUSTOM_CATEGORY,
  getServiceActivity,
  getServiceActivityEntries,
  type ActivityFilters,
} from "@/server/services/service-activity";
import { resolveDateRange } from "@/lib/domain/date-range";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const TZ = "Asia/Beirut";
const today = (): ActivityFilters => {
  const r = resolveDateRange("today", TZ);
  return { start: r.start, end: r.end };
};
const counts = (a: Awaited<ReturnType<typeof getServiceActivity>>) => Object.fromEntries(a.services.map((s) => [s.name, s.count]));

/** A paid sale for a client (or walk-in when client is null) with the given catalog services. */
async function sale(client: { id: string } | null, services: { id: string }[], opts: { status?: "PAID" | "PARTIAL" | "UNPAID"; employeeId?: string | null } = {}) {
  const status = opts.status ?? "PAID";
  return createSale(f.ctx, {
    clientId: client?.id ?? null,
    employeeId: opts.employeeId === undefined ? f.employee.id : opts.employeeId,
    items: services.map((s) => ({ serviceId: s.id, quantity: 1 })),
    paymentStatus: status,
    ...(status === "PAID" ? { paymentMethod: "CASH" as const } : {}),
    ...(status === "PARTIAL" ? { amountPaidCents: 100, paymentMethod: "CASH" as const } : {}),
  });
}

describe("service activity counts", () => {
  it("an empty period shows nothing", async () => {
    const a = await getServiceActivity(f.ctx, today());
    expect(a).toMatchObject({ services: [], totalServices: 0, differentServices: 0, clientsServed: 0, salesCount: 0 });
  });

  it("one sale with one service counts 1", async () => {
    await sale(f.clients.sarah, [f.services.manicure]);
    const a = await getServiceActivity(f.ctx, today());
    expect(counts(a)).toEqual({ Manicure: 1 });
    expect(a).toMatchObject({ totalServices: 1, differentServices: 1, clientsServed: 1 });
  });

  it("one sale with several services counts every service line", async () => {
    await sale(f.clients.sarah, [f.services.manicure, f.services.pedicure, f.services.gel]);
    const a = await getServiceActivity(f.ctx, today());
    expect(counts(a)).toEqual({ Manicure: 1, Pedicure: 1, "Gel Polish": 1 });
    expect(a).toMatchObject({ totalServices: 3, differentServices: 3, clientsServed: 1, salesCount: 1 });
  });

  it("a line with quantity 2 counts as performed twice", async () => {
    await createSale(f.ctx, {
      clientId: f.clients.sarah.id,
      employeeId: f.employee.id,
      items: [{ serviceId: f.services.manicure.id, quantity: 2 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    const a = await getServiceActivity(f.ctx, today());
    expect(counts(a)).toEqual({ Manicure: 2 });
    expect(a.totalServices).toBe(2);
  });

  it("multiple sales aggregate, the same service across clients groups into one row, sorted by count", async () => {
    await sale(f.clients.sarah, [f.services.manicure, f.services.pedicure]);
    await sale(f.clients.jessica, [f.services.manicure]);
    await sale(f.clients.maria, [f.services.manicure, f.services.color]);
    await sale(null, [f.services.pedicure]); // walk-in
    await sale(f.clients.sarah, [f.services.manicure]); // Sarah again
    const a = await getServiceActivity(f.ctx, today());
    expect(a.services.map((s) => [s.name, s.count])).toEqual([
      ["Manicure", 4],
      ["Pedicure", 2],
      ["Hair Color", 1],
    ]);
    expect(a.services.filter((s) => s.name === "Manicure")).toHaveLength(1);
    expect(a.totalServices).toBe(7);
    expect(a.differentServices).toBe(3);
    // Sarah, Jessica, Maria (unique) + one walk-in
    expect(a.clientsServed).toBe(4);
    expect(a.salesCount).toBe(5);
    expect(a.services[0]).toMatchObject({ category: "Nails", isCustom: false });
  });

  it("custom services count, grouped by name ignoring case and spaces, and never join the catalog", async () => {
    const custom = (name: string) =>
      createSale(f.ctx, {
        clientId: f.clients.maria.id,
        employeeId: f.employee.id,
        items: [{ kind: "custom", name, unitPriceCents: 800, estimatedCostCents: 0, quantity: 1 }],
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      });
    const before = await prisma.service.count();
    await custom("Nail Repair");
    await custom("nail  repair ");
    await custom("Brow Tint");
    await sale(f.clients.sarah, [f.services.manicure]);
    const a = await getServiceActivity(f.ctx, today());
    const repair = a.services.find((s) => s.name.toLowerCase() === "nail repair")!;
    expect(repair.name).toBe("Nail Repair"); // the capitalised spelling wins over "nail  repair "
    expect(repair).toMatchObject({ count: 2, isCustom: true, category: null });
    expect(a.services.find((s) => s.name === "Brow Tint")).toMatchObject({ count: 1, isCustom: true });
    expect(a).toMatchObject({ totalServices: 4, differentServices: 3 });
    expect(await prisma.service.count()).toBe(before);
    // category filter "Custom services"
    const onlyCustom = await getServiceActivity(f.ctx, { ...today(), categoryId: CUSTOM_CATEGORY });
    expect(onlyCustom.totalServices).toBe(3);
    // detail for the grouped custom service
    const entries = await getServiceActivityEntries(f.ctx, { ...today(), serviceKey: repair.key });
    expect(entries).toHaveLength(2);
  });

  it("a voided sale contributes nothing — services, totals, clients, employees, detail rows", async () => {
    await sale(f.clients.sarah, [f.services.manicure]);
    const before = await getServiceActivity(f.ctx, today());
    const mistaken = await sale(f.clients.jessica, [f.services.manicure, f.services.pedicure]);
    await voidSale(f.ctx, { saleId: mistaken.saleId, reason: "Entered by mistake" });
    const after = await getServiceActivity(f.ctx, today());
    expect(after).toEqual(before);
    expect(counts(after)).toEqual({ Manicure: 1 });
    expect(after.employees).toEqual([{ employeeId: f.employee.id, name: "Maya", count: 1 }]);
    const key = after.services[0].key;
    const entries = await getServiceActivityEntries(f.ctx, { ...today(), serviceKey: key });
    expect(entries.map((e) => e.saleId)).not.toContain(mistaken.saleId);
    expect(entries).toHaveLength(1);
    // the voided sale itself is still kept for the audit trail
    expect(await prisma.sale.findUnique({ where: { id: mistaken.saleId } })).toMatchObject({ voidReason: "Entered by mistake" });
  });

  it("filters by payment state", async () => {
    await sale(f.clients.sarah, [f.services.manicure], { status: "PAID" });
    await sale(f.clients.jessica, [f.services.manicure, f.services.pedicure], { status: "PARTIAL" });
    await sale(f.clients.maria, [f.services.color], { status: "UNPAID" });
    const by = async (paymentStatus: ActivityFilters["paymentStatus"]) => counts(await getServiceActivity(f.ctx, { ...today(), paymentStatus }));
    expect(await by("PAID")).toEqual({ Manicure: 1 });
    expect(await by("PARTIAL")).toEqual({ Manicure: 1, Pedicure: 1 });
    expect(await by("UNPAID")).toEqual({ "Hair Color": 1 });
    expect(await by(null)).toEqual({ Manicure: 2, Pedicure: 1, "Hair Color": 1 });
  });

  it("filters by employee and counts per employee", async () => {
    const rita = await prisma.employee.create({ data: { salonId: f.salon.id, name: "Rita" } });
    await sale(f.clients.sarah, [f.services.manicure, f.services.pedicure]); // Maya
    await sale(f.clients.jessica, [f.services.manicure], { employeeId: rita.id });
    await sale(f.clients.maria, [f.services.gel], { employeeId: null });
    const all = await getServiceActivity(f.ctx, today());
    expect(all.employees).toEqual([
      { employeeId: f.employee.id, name: "Maya", count: 2 },
      { employeeId: null, name: "No employee", count: 1 },
      { employeeId: rita.id, name: "Rita", count: 1 },
    ]);
    const ritaOnly = await getServiceActivity(f.ctx, { ...today(), employeeId: rita.id });
    expect(counts(ritaOnly)).toEqual({ Manicure: 1 });
    expect(ritaOnly).toMatchObject({ totalServices: 1, clientsServed: 1 });
  });

  it("filters by category and by a specific service", async () => {
    await sale(f.clients.sarah, [f.services.manicure, f.services.color]);
    await sale(f.clients.jessica, [f.services.manicure]);
    const nails = await prisma.category.findFirstOrThrow({ where: { salonId: f.salon.id, name: "Nails" } });
    expect(counts(await getServiceActivity(f.ctx, { ...today(), categoryId: nails.id }))).toEqual({ Manicure: 2 });
    const all = await getServiceActivity(f.ctx, today());
    const manicureKey = all.services.find((s) => s.name === "Manicure")!.key;
    const one = await getServiceActivity(f.ctx, { ...today(), serviceKey: manicureKey });
    expect(one).toMatchObject({ totalServices: 2, differentServices: 1, clientsServed: 2 });
  });

  it("service detail lists each entry with time, client (or walk-in) and employee", async () => {
    const s1 = await sale(f.clients.sarah, [f.services.manicure, f.services.pedicure]);
    const s2 = await sale(null, [f.services.manicure]);
    await prisma.sale.update({ where: { id: s1.saleId }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const key = (await getServiceActivity(f.ctx, today())).services.find((s) => s.name === "Manicure")!.key;
    const entries = await getServiceActivityEntries(f.ctx, { ...today(), serviceKey: key });
    expect(entries.map((e) => [e.saleId, e.clientName, e.isWalkIn, e.employeeName, e.quantity])).toEqual([
      [s1.saleId, "Sarah Johnson", false, "Maya", 1],
      [s2.saleId, "Walk-in Client", true, "Maya", 1],
    ]);
  });

  it("date ranges follow the salon's time zone, including the exact day boundaries", async () => {
    // 10 March 2026 in Beirut (UTC+2): 2026-03-09T22:00Z ≤ day < 2026-03-10T22:00Z
    const at = async (iso: string) => {
      const s = await sale(f.clients.sarah, [f.services.manicure]);
      await prisma.sale.update({ where: { id: s.saleId }, data: { createdAt: new Date(iso) } });
    };
    await at("2026-03-09T21:59:59.999Z"); // 23:59 on 9 March local — outside
    await at("2026-03-09T22:00:00.000Z"); // 00:00 on 10 March local — inside
    await at("2026-03-10T21:59:59.999Z"); // 23:59 on 10 March local — inside
    await at("2026-03-10T22:00:00.000Z"); // 00:00 on 11 March local — outside
    const r = resolveDateRange("custom", TZ, { from: "2026-03-10", to: "2026-03-10" });
    const a = await getServiceActivity(f.ctx, { start: r.start, end: r.end });
    expect(a.totalServices).toBe(2);
    const twoDays = resolveDateRange("custom", TZ, { from: "2026-03-09", to: "2026-03-10" });
    expect((await getServiceActivity(f.ctx, { start: twoDays.start, end: twoDays.end })).totalServices).toBe(3);
    // Yesterday / Today presets resolve around "now" in the salon zone
    const now = new Date("2026-03-10T23:30:00.000Z"); // 01:30 on 11 March local
    const yesterday = resolveDateRange("yesterday", TZ, { now });
    expect((await getServiceActivity(f.ctx, { start: yesterday.start, end: yesterday.end })).totalServices).toBe(2);
  });

  it("never counts another salon's sales", async () => {
    await sale(f.clients.sarah, [f.services.manicure]);
    const other = await createFixture("Other Salon");
    await createSale(other.ctx, {
      clientId: other.clients.sarah.id,
      employeeId: other.employee.id,
      items: [{ serviceId: other.services.manicure.id, quantity: 3 }],
      paymentStatus: "PAID",
      paymentMethod: "CASH",
    });
    const mine = await getServiceActivity(f.ctx, today());
    expect(mine).toMatchObject({ totalServices: 1, clientsServed: 1 });
    // their service key / employee / category filters return nothing for us
    const theirs = await getServiceActivity(other.ctx, today());
    const theirKey = theirs.services[0].key;
    expect((await getServiceActivity(f.ctx, { ...today(), serviceKey: theirKey })).totalServices).toBe(0);
    expect(await getServiceActivityEntries(f.ctx, { ...today(), serviceKey: theirKey })).toEqual([]);
    expect((await getServiceActivity(f.ctx, { ...today(), employeeId: other.employee.id })).totalServices).toBe(0);
  });

  it("matches the existing Reports service quantities and totals", async () => {
    await sale(f.clients.sarah, [f.services.manicure, f.services.pedicure]);
    await sale(null, [f.services.manicure]); // walk-in
    await sale(f.clients.jessica, [f.services.manicure], { status: "UNPAID" });
    const v = await sale(f.clients.maria, [f.services.color]);
    await voidSale(f.ctx, { saleId: v.saleId });
    const range = resolveDateRange("today", TZ);
    const report = await getFullReport(f.ctx, range);
    const a = await getServiceActivity(f.ctx, { start: range.start, end: range.end });
    expect(a.totalServices).toBe(report.summary.servicesCount);
    expect(a.clientsServed).toBe(report.summary.clientsCount);
    expect(Object.fromEntries(report.services.map((s) => [s.name, s.quantity]))).toEqual(counts(a));
  });
});
