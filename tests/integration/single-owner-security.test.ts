import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma, resetDb } from "./helpers";
import {
  authenticate,
  changePassword,
  countLoginAccounts,
  createAuthSession,
  createInitialOwner,
  SETUP_TOKEN_INVALID,
  validateAuthSession,
} from "@/server/services/auth";
import { requestPasswordReset, resetPassword } from "@/server/services/account";
import { inspectLoginAccounts, keepOnlyLoginAccount, maskEmail } from "@/server/maintenance/login-accounts";
import { createSale } from "@/server/services/sales";

const TOKEN = process.env.SALON_SETUP_TOKEN!;
const OWNER = { setupToken: TOKEN, name: "Elleyana", email: "owner@salon.test", password: "Strong-Pass-2026", confirm: "Strong-Pass-2026" };
const owner = () => createInitialOwner(OWNER);

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

describe("exactly one login account", () => {
  it("the database refuses a second login account of any role, even bypassing the app", async () => {
    const o = await owner();
    expect(await countLoginAccounts()).toBe(1);
    for (const role of ["OWNER", "MANAGER", "STAFF"] as const) {
      await expect(
        prisma.user.create({ data: { salonId: o.salonId, name: "Extra", email: `extra-${role.toLowerCase()}@salon.test`, passwordHash: "x", role } }),
      ).rejects.toThrow();
    }
    // raw SQL is refused too
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id, "salonId", name, email, "passwordHash", role, "updatedAt") VALUES ('x2', '${o.salonId}', 'x', 'x2@salon.test', 'x', 'OWNER', now())`,
      ),
    ).rejects.toThrow();
    expect(await countLoginAccounts()).toBe(1);
  });

  it("the only login account can never become a non-owner", async () => {
    const o = await owner();
    await expect(prisma.user.update({ where: { id: o.id }, data: { role: "STAFF" } })).rejects.toThrow();
  });

  it("no code path other than first-run setup creates a login account", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !p.includes("__tests__")) files.push(p);
      }
    };
    walk(path.resolve("src"));
    walk(path.resolve("scripts"));
    const creators = files.filter((f) => /\buser\.(create|createMany|upsert)\s*\(/.test(readFileSync(f, "utf8")));
    expect(creators.map((f) => path.relative(process.cwd(), f))).toEqual([path.join("src", "server", "services", "auth.ts")]);
  });
});

describe("login rate limiting", () => {
  const login = (email: string, password: string, ip = "203.0.113.7") => authenticate({ email, password }, { ip });

  it("locks an email after 5 failed attempts, even for the right password, then unlocks", async () => {
    await owner();
    for (let i = 0; i < 5; i++) expect(await login(OWNER.email, "Wrong-pass-1")).toEqual({ ok: false, reason: "invalid" });
    const locked = await login(OWNER.email, OWNER.password);
    expect(locked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect((locked as { retryAfterMs: number }).retryAfterMs).toBeGreaterThan(14 * 60_000);
    // other IPs are refused too (the limit is per email)
    expect(await login(OWNER.email, OWNER.password, "198.51.100.9")).toMatchObject({ reason: "rate_limited" });
    // once the lock passes, the right password works again and the counter resets
    await prisma.authThrottle.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000), windowStart: new Date(Date.now() - 16 * 60_000) } });
    expect(await login(OWNER.email, OWNER.password)).toMatchObject({ ok: true });
  });

  it("a successful login clears earlier typos for that email", async () => {
    await owner();
    for (let i = 0; i < 4; i++) await login(OWNER.email, "Wrong-pass-1");
    expect(await login(OWNER.email, OWNER.password)).toMatchObject({ ok: true });
    for (let i = 0; i < 4; i++) await login(OWNER.email, "Wrong-pass-1");
    expect(await login(OWNER.email, OWNER.password)).toMatchObject({ ok: true });
  });

  it("unknown emails are limited exactly the same way (nothing revealed)", async () => {
    await owner();
    for (let i = 0; i < 5; i++) expect(await login("nobody@salon.test", "Wrong-pass-1")).toEqual({ ok: false, reason: "invalid" });
    expect(await login("nobody@salon.test", "Wrong-pass-1")).toMatchObject({ reason: "rate_limited" });
  });

  it("limits one IP to 20 failures across many emails", async () => {
    await owner();
    for (let i = 0; i < 20; i++) await login(`guess${i}@salon.test`, "Wrong-pass-1", "192.0.2.50");
    expect(await login(OWNER.email, OWNER.password, "192.0.2.50")).toMatchObject({ reason: "rate_limited" });
    expect(await login(OWNER.email, OWNER.password, "192.0.2.51")).toMatchObject({ ok: true });
  });

  it("concurrent failures are all counted", async () => {
    await owner();
    await Promise.all(Array.from({ length: 8 }, () => login(OWNER.email, "Wrong-pass-1")));
    expect(await login(OWNER.email, OWNER.password)).toMatchObject({ reason: "rate_limited" });
  });

  it("stores only hashed keys — no email or IP in clear", async () => {
    await owner();
    await login(OWNER.email, "Wrong-pass-1", "203.0.113.99");
    const rows = JSON.stringify(await prisma.authThrottle.findMany());
    expect(rows).not.toContain(OWNER.email);
    expect(rows).not.toContain("203.0.113.99");
  });
});

describe("other brute-force limits", () => {
  it("wrong setup tokens are limited per IP", async () => {
    for (let i = 0; i < 10; i++) {
      await expect(createInitialOwner({ ...OWNER, setupToken: `wrong-${i}` }, { ip: "203.0.113.5" })).rejects.toThrow(SETUP_TOKEN_INVALID);
    }
    await expect(createInitialOwner(OWNER, { ip: "203.0.113.5" })).rejects.toThrow(/Too many attempts/);
    expect(await countLoginAccounts()).toBe(0);
    // a different IP with the right token still works
    await expect(createInitialOwner(OWNER, { ip: "203.0.113.6" })).resolves.toMatchObject({ role: "OWNER" });
  });

  it("the current-password check is limited to 5 wrong tries", async () => {
    const o = await owner();
    const s = await createAuthSession(o.id);
    const ctx = { userId: o.id, sessionId: s.id };
    const attempt = (currentPassword: string) => changePassword(ctx, { currentPassword, password: "Brand-New-2026", confirm: "Brand-New-2026" });
    for (let i = 0; i < 5; i++) await expect(attempt("Wrong-pass-1")).rejects.toThrow(/incorrect/);
    await expect(attempt(OWNER.password)).rejects.toThrow(/Too many attempts/);
    expect(await bcrypt.compare(OWNER.password, (await prisma.user.findUniqueOrThrow({ where: { id: o.id } })).passwordHash)).toBe(true);
  });

  it("password-reset requests are limited (3 per email per hour) and create nothing beyond that", async () => {
    await owner();
    const links = [];
    for (let i = 0; i < 5; i++) links.push(await requestPasswordReset(OWNER.email, "http://localhost:3000", { ip: `198.51.100.${i}` }));
    expect(links.filter(Boolean)).toHaveLength(3);
    expect(await prisma.passwordResetToken.count()).toBe(3);
  });

  it("a reset link submitted twice at the same moment works only once", async () => {
    const o = await owner();
    const link = await requestPasswordReset(OWNER.email, "http://localhost:3000");
    const token = new URL(link!).searchParams.get("token")!;
    const results = await Promise.allSettled([
      resetPassword({ token, password: "First-Reset-2026", confirm: "First-Reset-2026" }),
      resetPassword({ token, password: "Second-Reset-2026", confirm: "Second-Reset-2026" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: o.id } })).passwordHash;
    const first = await bcrypt.compare("First-Reset-2026", hash);
    const second = await bcrypt.compare("Second-Reset-2026", hash);
    expect(first !== second).toBe(true);
  });
});

describe("login account maintenance (accounts:check / accounts:keep-only)", () => {
  // Recreate an older database that still holds the demo login next to the real owner.
  async function legacyTwoAccounts() {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_single_account"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_owner_only"`);
    const salon = await prisma.salon.create({ data: { name: "Elleyana Beauty Salon" } });
    const demo = await prisma.user.create({
      data: { salonId: salon.id, name: "Maya", email: "maya@salonflow.com", passwordHash: await bcrypt.hash("password123", 4), role: "OWNER" },
    });
    const real = await prisma.user.create({
      data: { salonId: salon.id, name: "Elleyana", email: "elleyana@salon.test", passwordHash: await bcrypt.hash("Real-Owner-2026", 4), role: "OWNER" },
    });
    const client = await prisma.client.create({ data: { salonId: salon.id, firstName: "Nour" } });
    const category = await prisma.category.create({ data: { salonId: salon.id, name: "Nails" } });
    const service = await prisma.service.create({ data: { salonId: salon.id, categoryId: category.id, name: "Manicure", priceCents: 1000 } });
    const sale = await createSale(
      { salonId: salon.id, userId: demo.id, timezone: "Asia/Beirut", role: "OWNER" },
      { clientId: client.id, items: [{ serviceId: service.id, quantity: 1 }], paymentStatus: "PAID", paymentMethod: "CASH" },
    );
    return { demo, real, sale };
  }
  afterEach(async () => {
    // leave the test database with its constraints, whatever a test did
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_owner_only') THEN ALTER TABLE "User" ADD CONSTRAINT "User_owner_only" CHECK ("role" = 'OWNER'); END IF; END $$`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_single_account" ON "User" ((true))`);
  });

  it("check reports every account masked, and flags one that accepts a public password", async () => {
    await legacyTwoAccounts();
    const s = await inspectLoginAccounts(prisma);
    expect(s.accounts.map((a) => [a.maskedEmail, a.weakKnownPassword])).toEqual([
      ["m***@salonflow.com", true],
      ["e***@salon.test", false],
    ]);
    expect(s).toMatchObject({ singleAccountEnforced: false, ownerOnlyEnforced: false });
    expect(JSON.stringify(s)).not.toMatch(/maya@|elleyana@|\$2[aby]\$/);
  });

  it("keep-only: dry run changes nothing; confirm removes the extra login, keeps every salon record, and locks it in", async () => {
    const { real, sale } = await legacyTwoAccounts();
    const before = { sales: await prisma.sale.count(), payments: await prisma.payment.count(), clients: await prisma.client.count() };

    const dry = await keepOnlyLoginAccount(prisma, "Elleyana@Salon.test", { confirm: false });
    expect(dry).toEqual({ ok: true, dryRun: true, kept: "e***@salon.test", removed: ["m***@salonflow.com"] });
    expect(await prisma.user.count()).toBe(2);

    expect(await keepOnlyLoginAccount(prisma, "nobody@salon.test", { confirm: true })).toMatchObject({ ok: false });
    expect(await prisma.user.count()).toBe(2);

    await keepOnlyLoginAccount(prisma, "elleyana@salon.test", { confirm: true });
    expect((await prisma.user.findMany()).map((u) => u.id)).toEqual([real.id]);
    expect({ sales: await prisma.sale.count(), payments: await prisma.payment.count(), clients: await prisma.client.count() }).toEqual(before);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).createdById).toBeNull();
    expect(await prisma.appSetup.count()).toBe(1);
    const s = await inspectLoginAccounts(prisma);
    expect(s).toMatchObject({ singleAccountEnforced: true, ownerOnlyEnforced: true, setupComplete: true });
    await expect(
      prisma.user.create({ data: { salonId: real.salonId, name: "x", email: "again@salon.test", passwordHash: "x" } }),
    ).rejects.toThrow();
    // the remaining owner still signs in
    expect(await authenticate({ email: "elleyana@salon.test", password: "Real-Owner-2026" })).toMatchObject({ ok: true });
    expect(await authenticate({ email: "maya@salonflow.com", password: "password123" })).toMatchObject({ ok: false });
  });

  it("masks emails", () => {
    expect(maskEmail("jane.doe@gmail.com")).toBe("j***@gmail.com");
  });
});

describe("sessions after the owner signs in", () => {
  it("a valid session still validates (sanity)", async () => {
    const o = await owner();
    const s = await createAuthSession(o.id);
    expect(await validateAuthSession(s.id, o.id)).not.toBeNull();
  });
});
