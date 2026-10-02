/**
 * Development seed: one salon, an owner login, employees, the service menu,
 * clients, ~6 weeks of paid / partial / unpaid sales, later payments and expenses.
 *
 *   npm run db:seed
 *
 * WARNING: wipes all existing data in the target database first.
 */
import { PrismaClient, type PaymentMethod } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import {
  calculatePaymentStatus,
  calculateSaleTotals,
  type DiscountInput,
} from "../src/lib/domain/sale-calculations";

const prisma = new PrismaClient();
const TZ = "Asia/Beirut";

export const SEED_LOGIN = { email: "maya@salonflow.com", password: "salonflow123" };

// Deterministic pseudo-random numbers so every seed run looks the same.
let state = 20261002;
function rand() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

/** Salon-local wall-clock time `daysAgo` days before today. */
function localTime(daysAgo: number, hour: number, minute = 0): Date {
  const now = new TZDate(new Date(), TZ);
  const day = addDays(new TZDate(now.getFullYear(), now.getMonth(), now.getDate(), TZ), -daysAgo);
  return new Date(new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, TZ).getTime());
}

async function main() {
  console.log("Clearing existing data…");
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
    prisma.user.deleteMany(),
    prisma.salon.deleteMany(),
  ]);

  const salon = await prisma.salon.create({ data: { name: "Elleyana Beauty Salon", timezone: TZ } });
  const owner = await prisma.user.create({
    data: {
      salonId: salon.id,
      name: "Maya",
      email: SEED_LOGIN.email,
      passwordHash: await bcrypt.hash(SEED_LOGIN.password, 12),
      role: "OWNER",
    },
  });

  const [maya, sara, emma] = await Promise.all(
    [
      { name: "Maya", role: "Owner / Nail Artist", phone: "+961 70 111 222", commissionType: "NONE" as const, commissionValue: 0 },
      { name: "Sara", role: "Hair Stylist", phone: "+961 71 333 444", commissionType: "PERCENTAGE" as const, commissionValue: 1500 },
      { name: "Emma", role: "Aesthetician", phone: "+961 76 555 666", commissionType: "FIXED" as const, commissionValue: 300 },
    ].map((e) => prisma.employee.create({ data: { ...e, salonId: salon.id } })),
  );

  const categoryNames = ["Nails", "Hair", "Face", "Laser", "Other"];
  const categories = Object.fromEntries(
    await Promise.all(
      categoryNames.map(async (name, i) => [
        name,
        await prisma.category.create({ data: { salonId: salon.id, name, sortOrder: i } }),
      ]),
    ),
  );

  const menu: { name: string; category: string; price: number; cost: number; duration: number }[] = [
    { name: "Manicure", category: "Nails", price: 1000, cost: 200, duration: 30 },
    { name: "Pedicure", category: "Nails", price: 1500, cost: 300, duration: 45 },
    { name: "Gel Polish", category: "Nails", price: 2000, cost: 400, duration: 45 },
    { name: "Nail Art", category: "Nails", price: 800, cost: 150, duration: 20 },
    { name: "Haircut", category: "Hair", price: 2500, cost: 200, duration: 45 },
    { name: "Blow Dry", category: "Hair", price: 1500, cost: 150, duration: 30 },
    { name: "Hair Color", category: "Hair", price: 5000, cost: 1200, duration: 90 },
    { name: "Facial Treatment", category: "Face", price: 3500, cost: 800, duration: 60 },
    { name: "Eyebrow Threading", category: "Face", price: 500, cost: 50, duration: 15 },
    { name: "Laser Hair Removal", category: "Laser", price: 4000, cost: 600, duration: 30 },
    { name: "Bridal Makeup", category: "Other", price: 12000, cost: 2500, duration: 120 },
  ];
  const services = Object.fromEntries(
    await Promise.all(
      menu.map(async (m, i) => [
        m.name,
        await prisma.service.create({
          data: {
            salonId: salon.id,
            categoryId: categories[m.category].id,
            name: m.name,
            priceCents: m.price,
            estimatedCostCents: m.cost,
            durationMinutes: m.duration,
            sortOrder: i,
          },
          include: { category: true },
        }),
      ]),
    ),
  );

  const clientSeed = [
    { firstName: "Sarah", lastName: "Johnson", phone: "+961 70 123 456", email: "sarah.johnson@example.com" },
    { firstName: "Jessica", lastName: null, phone: "+961 71 234 567" },
    { firstName: "Maria", lastName: null, phone: "+961 76 345 678" },
    { firstName: "Linda", lastName: null, phone: "+961 3 456 789", notes: "Prefers appointments after 4 pm." },
    { firstName: "Nour", lastName: "Haddad", phone: "+961 70 987 654" },
    { firstName: "Rita", lastName: "Khoury", phone: "+961 71 876 543" },
    { firstName: "Lara", lastName: "Saad", phone: "+961 76 765 432", notes: "Sensitive skin — patch test before new products." },
    { firstName: "Hala", lastName: "Mansour", phone: "+961 3 654 321" },
    { firstName: "Yasmine", lastName: "Fares", phone: null },
    { firstName: "Christina", lastName: "Abboud", phone: "+961 70 543 210" },
  ];
  const clients = await Promise.all(clientSeed.map((c) => prisma.client.create({ data: { ...c, salonId: salon.id } })));
  const byName = (first: string) => clients.find((c) => c.firstName === first)!;

  interface SeedSale {
    at: Date;
    clientId: string | null;
    employeeId: string;
    items: [string, number][];
    /** Per-sale price overrides by service name (price charged per unit, cents). */
    overrides?: Record<string, number>;
    /** One-off custom services (never added to the catalog). */
    custom?: { name: string; price: number; cost?: number; qty?: number }[];
    discount?: DiscountInput;
    /** Payments: [amount (null = full remaining), method, at] */
    payments: [number | null, PaymentMethod, Date][];
    notes?: string;
  }

  async function createSale(s: SeedSale) {
    const lines = [
      ...s.items.map(([name, qty]) => {
        const service = services[name];
        return {
          serviceId: service.id,
          isCustom: false,
          serviceNameSnapshot: service.name,
          categoryNameSnapshot: service.category.name,
          standardPriceSnapshotCents: service.priceCents,
          unitPriceChargedCents: s.overrides?.[name] ?? service.priceCents,
          serviceCostSnapshotCents: service.estimatedCostCents,
          quantity: qty,
        };
      }),
      ...(s.custom ?? []).map((c) => ({
        serviceId: null,
        isCustom: true,
        serviceNameSnapshot: c.name,
        categoryNameSnapshot: null,
        standardPriceSnapshotCents: null,
        unitPriceChargedCents: c.price,
        serviceCostSnapshotCents: c.cost ?? 0,
        quantity: c.qty ?? 1,
      })),
    ];
    const totals = calculateSaleTotals(
      lines.map((l) => ({ unitPriceCents: l.unitPriceChargedCents, quantity: l.quantity })),
      s.discount,
    );
    let paid = 0;
    const payments = s.payments.map(([amount, method, at]) => {
      const amountCents = amount ?? totals.finalTotalCents - paid;
      paid += amountCents;
      return { salonId: salon.id, clientId: s.clientId, receivedById: owner.id, amountCents, method, createdAt: at };
    }).filter((p) => p.amountCents > 0);
    await prisma.sale.create({
      data: {
        salonId: salon.id,
        clientId: s.clientId,
        employeeId: s.employeeId,
        createdById: owner.id,
        subtotalCents: totals.subtotalCents,
        discountType: totals.discountCents > 0 ? s.discount?.type : null,
        discountValue: totals.discountCents > 0 ? (s.discount?.value ?? 0) : 0,
        discountCents: totals.discountCents,
        finalTotalCents: totals.finalTotalCents,
        paymentStatus: calculatePaymentStatus(totals.finalTotalCents, paid),
        notes: s.notes,
        createdAt: s.at,
        items: {
          create: lines.map((l) => ({ ...l, lineTotalCents: l.unitPriceChargedCents * l.quantity, createdAt: s.at })),
        },
        payments: payments.length ? { create: payments } : undefined,
      },
    });
  }

  console.log("Creating sales…");
  const combos: { items: [string, number][]; employee: typeof maya }[] = [
    { items: [["Manicure", 1], ["Pedicure", 1]], employee: maya },
    { items: [["Gel Polish", 1]], employee: maya },
    { items: [["Gel Polish", 1], ["Nail Art", 1]], employee: maya },
    { items: [["Manicure", 1]], employee: maya },
    { items: [["Haircut", 1], ["Blow Dry", 1]], employee: sara },
    { items: [["Blow Dry", 1]], employee: sara },
    { items: [["Hair Color", 1]], employee: sara },
    { items: [["Haircut", 1]], employee: sara },
    { items: [["Facial Treatment", 1]], employee: emma },
    { items: [["Eyebrow Threading", 1], ["Facial Treatment", 1]], employee: emma },
    { items: [["Laser Hair Removal", 1]], employee: emma },
    { items: [["Eyebrow Threading", 1]], employee: emma },
  ];
  const methods: PaymentMethod[] = ["CASH", "CASH", "CASH", "CARD", "CARD", "BANK_TRANSFER", "WHISH", "OMT"];
  const regulars = clients.filter((c) => !["Jessica", "Maria", "Linda"].includes(c.firstName));

  // Six weeks of everyday business (mostly paid, the odd balance settled later).
  for (let daysAgo = 42; daysAgo >= 1; daysAgo--) {
    const count = 4 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const combo = pick(combos);
      const at = localTime(daysAgo, 9 + Math.floor(rand() * 10), Math.floor(rand() * 4) * 15);
      const walkIn = rand() < 0.2;
      const r = rand();
      const discount: DiscountInput | undefined = rand() < 0.08 ? { type: "PERCENTAGE", value: 1000 } : undefined;
      let payments: SeedSale["payments"] = [[null, pick(methods), at]];
      if (!walkIn && r > 0.9) {
        // Paid partly now, rest a few days later (payment date ≠ service date).
        const later = localTime(Math.max(daysAgo - 3, 0), 12);
        const firstPart = Math.floor(combo.items.reduce((sum, [n, q]) => sum + services[n].priceCents * q, 0) / 200) * 100;
        payments = [[firstPart, "CASH", at], [null, pick(methods), later]];
      } else if (!walkIn && r > 0.85) {
        payments = [[null, pick(methods), localTime(Math.max(daysAgo - 5, 0), 15)]];
      }
      await createSale({
        at,
        clientId: walkIn ? null : pick(regulars).id,
        employeeId: combo.employee.id,
        items: combo.items,
        discount,
        payments,
      });
    }
  }

  // The acceptance-test style scenarios with clearly owed balances.
  await createSale({
    at: localTime(12, 11, 30),
    clientId: byName("Jessica").id,
    employeeId: sara.id,
    items: [["Hair Color", 1]],
    payments: [],
    notes: "Will pay next visit.",
  });
  await createSale({
    at: localTime(6, 16),
    clientId: byName("Maria").id,
    employeeId: maya.id,
    items: [["Gel Polish", 1], ["Pedicure", 1]],
    payments: [[2000, "CASH", localTime(6, 16)]],
  });
  await createSale({
    at: localTime(20, 17),
    clientId: byName("Linda").id,
    employeeId: emma.id,
    items: [["Facial Treatment", 1], ["Laser Hair Removal", 1]],
    payments: [[3000, "WHISH", localTime(20, 17)]],
  });
  await createSale({
    at: localTime(3, 17, 30),
    clientId: byName("Linda").id,
    employeeId: sara.id,
    items: [["Hair Color", 1], ["Blow Dry", 1]],
    payments: [],
  });
  await createSale({
    at: localTime(9, 10),
    clientId: byName("Sarah").id,
    employeeId: emma.id,
    items: [["Laser Hair Removal", 1]],
    payments: [[1000, "CARD", localTime(9, 10)]],
  });

  // A loyal client's pedicure at a special price, plus a one-off nail repair.
  await createSale({
    at: localTime(2, 15, 30),
    clientId: byName("Rita").id,
    employeeId: maya.id,
    items: [["Pedicure", 1]],
    overrides: { Pedicure: 1000 },
    custom: [{ name: "Nail Repair", price: 800, cost: 100 }],
    payments: [[null, "CASH", localTime(2, 15, 30)]],
  });
  // A complimentary eyebrow touch-up ($0) still counts as a performed service.
  await createSale({
    at: localTime(1, 13, 0),
    clientId: byName("Hala").id,
    employeeId: emma.id,
    items: [["Facial Treatment", 1], ["Eyebrow Threading", 1]],
    overrides: { "Eyebrow Threading": 0 },
    payments: [[null, "CARD", localTime(1, 13, 0)]],
  });

  // Today
  await createSale({
    at: localTime(0, 9, 15),
    clientId: byName("Sarah").id,
    employeeId: maya.id,
    items: [["Manicure", 1], ["Pedicure", 1]],
    payments: [[null, "CASH", localTime(0, 9, 15)]],
  });
  await createSale({
    at: localTime(0, 10, 0),
    clientId: byName("Nour").id,
    employeeId: sara.id,
    items: [["Haircut", 1], ["Blow Dry", 1]],
    payments: [[null, "CARD", localTime(0, 10, 0)]],
  });
  await createSale({
    at: localTime(0, 10, 45),
    clientId: null,
    employeeId: emma.id,
    items: [["Eyebrow Threading", 1]],
    payments: [[null, "CASH", localTime(0, 10, 45)]],
  });

  console.log("Creating expenses…");
  const expenseSeed: { category: "RENT" | "PRODUCTS" | "ELECTRICITY" | "SALARIES" | "MARKETING" | "MAINTENANCE" | "OTHER"; description: string; amount: number; daysAgo: number; method: PaymentMethod | null }[] = [
    { category: "RENT", description: "Monthly rent", amount: 120000, daysAgo: 31, method: "BANK_TRANSFER" },
    { category: "RENT", description: "Monthly rent", amount: 120000, daysAgo: 1, method: "BANK_TRANSFER" },
    { category: "ELECTRICITY", description: "Generator & EDL bill", amount: 18500, daysAgo: 28, method: "CASH" },
    { category: "ELECTRICITY", description: "Generator & EDL bill", amount: 19200, daysAgo: 2, method: "CASH" },
    { category: "PRODUCTS", description: "Gel polish restock", amount: 24000, daysAgo: 25, method: "CARD" },
    { category: "PRODUCTS", description: "Hair color & developer", amount: 31000, daysAgo: 14, method: "CASH" },
    { category: "PRODUCTS", description: "Facial masks & serums", amount: 15500, daysAgo: 5, method: "WHISH" },
    { category: "SALARIES", description: "Assistant salary", amount: 60000, daysAgo: 30, method: "CASH" },
    { category: "MARKETING", description: "Instagram promotion", amount: 5000, daysAgo: 10, method: "CARD" },
    { category: "MAINTENANCE", description: "Pedicure chair repair", amount: 7500, daysAgo: 18, method: "CASH" },
    { category: "OTHER", description: "Coffee & refreshments", amount: 2500, daysAgo: 4, method: "CASH" },
  ];
  for (const e of expenseSeed) {
    await prisma.expense.create({
      data: {
        salonId: salon.id,
        category: e.category,
        description: e.description,
        amountCents: e.amount,
        paymentMethod: e.method,
        date: localTime(e.daysAgo, 0, 0),
      },
    });
  }

  const [sales, payments] = await Promise.all([prisma.sale.count(), prisma.payment.count()]);
  console.log(`Seeded ${sales} sales, ${payments} payments, ${clients.length} clients.`);
  console.log(`Log in with ${SEED_LOGIN.email} / ${SEED_LOGIN.password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
