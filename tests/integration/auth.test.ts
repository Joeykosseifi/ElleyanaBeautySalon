import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { decode, encode } from "next-auth/jwt";
import { prisma, resetDb } from "./helpers";
import {
  BCRYPT_COST,
  SESSION_MAX_AGE_SECONDS,
  SETUP_ALREADY_DONE,
  changeEmail,
  changePassword,
  createAuthSession,
  createInitialOwner,
  isSetupRequired,
  revokeAuthSession,
  validateAuthSession,
  verifyCredentials,
} from "@/server/services/auth";
import { requestPasswordReset, resetPassword } from "@/server/services/account";

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const OWNER = { name: "Elleyana", email: "owner@salon.test", password: "Strong-Pass-2026", confirm: "Strong-Pass-2026" };
const login = (email: string, password: string) => verifyCredentials({ email, password });

/** Simulate a browser: a real Auth.js session cookie value, signed with the app secret. */
const SECRET = "test-secret-at-least-32-characters-long!!";
const COOKIE = "authjs.session-token";
async function cookieFor(uid: string, sid: string) {
  return encode({ token: { uid, sid }, secret: SECRET, salt: COOKIE, maxAge: SESSION_MAX_AGE_SECONDS });
}
async function userFromCookie(cookie: string) {
  const token = await decode({ token: cookie, secret: SECRET, salt: COOKIE });
  return validateAuthSession(token?.sid as string, token?.uid as string);
}

describe("first-run owner setup", () => {
  it("a fresh database needs setup", async () => {
    expect(await isSetupRequired()).toBe(true);
  });

  it("creates the first account as OWNER of Elleyana Beauty Salon, with a bcrypt-hashed password", async () => {
    const owner = await createInitialOwner({ ...OWNER, email: "  Owner@Salon.TEST " });
    expect(owner).toMatchObject({ name: "Elleyana", email: "owner@salon.test", role: "OWNER" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, include: { salon: true } });
    expect(row.role).toBe("OWNER");
    expect(row.salon.name).toBe("Elleyana Beauty Salon");
    // never plaintext; bcrypt with the configured cost
    expect(row.passwordHash).not.toContain(OWNER.password);
    expect(row.passwordHash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    expect(await bcrypt.compare(OWNER.password, row.passwordHash)).toBe(true);
    expect(await prisma.appSetup.count()).toBe(1);
    expect(await isSetupRequired()).toBe(false);
  });

  it("refuses a second initial owner — even with different details", async () => {
    await createInitialOwner(OWNER);
    await expect(
      createInitialOwner({ name: "Intruder", email: "intruder@evil.test", password: "Other-Pass-999", confirm: "Other-Pass-999" }),
    ).rejects.toThrow(SETUP_ALREADY_DONE);
    expect(await prisma.user.count()).toBe(1);
  });

  it("concurrent setup attempts create exactly one owner", async () => {
    const attempts = Array.from({ length: 6 }, (_, i) =>
      createInitialOwner({ name: `Owner ${i}`, email: `owner${i}@race.test`, password: "Race-Pass-2026", confirm: "Race-Pass-2026" }),
    );
    const results = await Promise.allSettled(attempts);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toContain(SETUP_ALREADY_DONE);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.salon.count()).toBe(1);
    expect(await prisma.appSetup.count()).toBe(1);
  });

  it("an install that already has users (from before this feature) never needs setup", async () => {
    const salon = await prisma.salon.create({ data: { name: "Existing" } });
    await prisma.user.create({ data: { salonId: salon.id, name: "Old Owner", email: "old@owner.test", passwordHash: "x", role: "OWNER" } });
    expect(await isSetupRequired()).toBe(false);
    await expect(createInitialOwner(OWNER)).rejects.toThrow(SETUP_ALREADY_DONE);
  });

  it("refuses invalid email and weak / mismatched passwords, creating nothing", async () => {
    const bad = [
      { ...OWNER, email: "not-an-email" },
      { ...OWNER, email: "" },
      { ...OWNER, name: "  " },
      { ...OWNER, password: "short1", confirm: "short1" },
      { ...OWNER, password: "onlyletters", confirm: "onlyletters" },
      { ...OWNER, password: "1234567890", confirm: "1234567890" },
      { ...OWNER, password: "password123", confirm: "password123" },
      { ...OWNER, confirm: "Different-2026" },
    ];
    for (const input of bad) await expect(createInitialOwner(input)).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
    expect(await isSetupRequired()).toBe(true);
  });
});

describe("login and persistent sessions", () => {
  it("correct credentials work (email is case-insensitive); wrong password and unknown email fail", async () => {
    await createInitialOwner(OWNER);
    expect(await login(OWNER.email, OWNER.password)).toMatchObject({ email: OWNER.email, role: "OWNER" });
    expect(await login("OWNER@SALON.TEST", OWNER.password)).not.toBeNull();
    expect(await login(OWNER.email, "Wrong-Pass-2026")).toBeNull();
    expect(await login("nobody@salon.test", OWNER.password)).toBeNull();
    expect(await login(OWNER.email, "")).toBeNull();
  });

  it("stays signed in across a browser/app restart while the session is valid", async () => {
    const owner = await createInitialOwner(OWNER);
    const session = await createAuthSession(owner.id, "Test Browser");
    const cookie = await cookieFor(owner.id, session.id); // what the browser stores (30 days)

    // ... browser closed, server restarted (fresh DB connection) ...
    await prisma.$disconnect();
    const restored = await userFromCookie(cookie);
    expect(restored).toMatchObject({ id: owner.id, email: OWNER.email });

    const row = await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } });
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("logout revokes only that session; the cookie no longer works", async () => {
    const owner = await createInitialOwner(OWNER);
    const phone = await createAuthSession(owner.id, "Phone");
    const laptop = await createAuthSession(owner.id, "Laptop");
    const phoneCookie = await cookieFor(owner.id, phone.id);
    await revokeAuthSession(phone.id); // Logout on the phone
    expect(await userFromCookie(phoneCookie)).toBeNull();
    expect(await validateAuthSession(laptop.id, owner.id)).not.toBeNull();
  });

  it("expired, revoked, forged and mismatched sessions are rejected", async () => {
    const owner = await createInitialOwner(OWNER);
    const s = await createAuthSession(owner.id);
    await prisma.authSession.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateAuthSession(s.id, owner.id)).toBeNull();
    const s2 = await createAuthSession(owner.id);
    expect(await validateAuthSession(s2.id, "someone-else")).toBeNull();
    expect(await validateAuthSession("made-up-session-id", owner.id)).toBeNull();
    expect(await validateAuthSession(null, owner.id)).toBeNull();
    // a cookie signed with another secret is not accepted at all
    const forged = await encode({ token: { uid: owner.id, sid: s2.id }, secret: "another-secret-another-secret-123", salt: COOKIE });
    await expect(decode({ token: forged, secret: SECRET, salt: COOKIE })).rejects.toThrow(/decryption secret/);
  });

  it("an active session's expiry slides forward when used", async () => {
    const owner = await createInitialOwner(OWNER);
    const s = await createAuthSession(owner.id);
    const old = new Date(Date.now() - 3 * 86_400_000);
    await prisma.authSession.update({ where: { id: s.id }, data: { lastSeenAt: old, expiresAt: new Date(old.getTime() + SESSION_MAX_AGE_SECONDS * 1000) } });
    await validateAuthSession(s.id, owner.id);
    const row = await prisma.authSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.lastSeenAt.getTime()).toBeGreaterThan(old.getTime());
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });
});

describe("change email", () => {
  async function setup() {
    const owner = await createInitialOwner(OWNER);
    const current = await createAuthSession(owner.id, "This device");
    const other = await createAuthSession(owner.id, "Other device");
    return { owner, ctx: { userId: owner.id, sessionId: current.id }, current, other };
  }

  it("requires the correct current password", async () => {
    const { ctx } = await setup();
    await expect(changeEmail(ctx, { currentPassword: "", newEmail: "new@salon.test" })).rejects.toThrow();
    await expect(changeEmail(ctx, { currentPassword: "Wrong-Pass-2026", newEmail: "new@salon.test" })).rejects.toThrow(/Current password is incorrect/);
    expect((await prisma.user.findFirstOrThrow()).email).toBe(OWNER.email);
  });

  it("refuses invalid and duplicate emails (case-insensitively)", async () => {
    const { owner, ctx } = await setup();
    await prisma.user.create({ data: { salonId: owner.salonId, name: "Staff", email: "staff@salon.test", passwordHash: "x", role: "STAFF" } });
    await expect(changeEmail(ctx, { currentPassword: OWNER.password, newEmail: "not-an-email" })).rejects.toThrow();
    await expect(changeEmail(ctx, { currentPassword: OWNER.password, newEmail: "staff@salon.test" })).rejects.toThrow(/already uses/);
    await expect(changeEmail(ctx, { currentPassword: OWNER.password, newEmail: "STAFF@Salon.Test" })).rejects.toThrow(/already uses/);
    // and the database itself rejects a mixed-case duplicate
    await expect(prisma.user.update({ where: { id: owner.id }, data: { email: "Staff@salon.test" } })).rejects.toThrow();
  });

  it("new email works, old email stops working, other devices are signed out", async () => {
    const { ctx, current, other } = await setup();
    const res = await changeEmail(ctx, { currentPassword: OWNER.password, newEmail: "New.Owner@Salon.test" });
    expect(res).toMatchObject({ email: "new.owner@salon.test", revokedOtherSessions: 1 });
    expect(await login("new.owner@salon.test", OWNER.password)).not.toBeNull();
    expect(await login(OWNER.email, OWNER.password)).toBeNull();
    expect(await validateAuthSession(current.id, ctx.userId)).not.toBeNull();
    expect(await validateAuthSession(other.id, ctx.userId)).toBeNull();
  });
});

describe("change password", () => {
  const NEW = "Brand-New-Pass-77";
  async function setup() {
    const owner = await createInitialOwner(OWNER);
    const current = await createAuthSession(owner.id, "This device");
    const other = await createAuthSession(owner.id, "Other device");
    return { ctx: { userId: owner.id, sessionId: current.id }, current, other };
  }

  it("requires the correct current password", async () => {
    const { ctx } = await setup();
    await expect(changePassword(ctx, { currentPassword: "", password: NEW, confirm: NEW })).rejects.toThrow();
    await expect(changePassword(ctx, { currentPassword: "Wrong-Pass-2026", password: NEW, confirm: NEW })).rejects.toThrow(/Current password is incorrect/);
    expect(await login(OWNER.email, OWNER.password)).not.toBeNull();
  });

  it("validates the new password", async () => {
    const { ctx } = await setup();
    await expect(changePassword(ctx, { currentPassword: OWNER.password, password: "weak", confirm: "weak" })).rejects.toThrow();
    await expect(changePassword(ctx, { currentPassword: OWNER.password, password: NEW, confirm: "Mismatch-2026" })).rejects.toThrow();
    await expect(changePassword(ctx, { currentPassword: OWNER.password, password: OWNER.password, confirm: OWNER.password })).rejects.toThrow(/different/);
  });

  it("stores the new password hashed; old password stops working; new one works; other sessions revoked", async () => {
    const { ctx, current, other } = await setup();
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } })).passwordHash;
    const res = await changePassword(ctx, { currentPassword: OWNER.password, password: NEW, confirm: NEW });
    expect(res.revokedOtherSessions).toBe(1);
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } })).passwordHash;
    expect(after).not.toBe(before);
    expect(after).not.toContain(NEW);
    expect(after).toMatch(/^\$2[aby]\$12\$/);
    expect(await login(OWNER.email, OWNER.password)).toBeNull();
    expect(await login(OWNER.email, NEW)).not.toBeNull();
    expect(await validateAuthSession(current.id, ctx.userId)).not.toBeNull();
    expect(await validateAuthSession(other.id, ctx.userId)).toBeNull();
  });

  it("a password reset signs out every session and invalidates other reset links", async () => {
    const { ctx, current, other } = await setup();
    const link1 = await requestPasswordReset(OWNER.email, "http://localhost:3000");
    const link2 = await requestPasswordReset(OWNER.email, "http://localhost:3000");
    const token = new URL(link1!).searchParams.get("token")!;
    await resetPassword({ token, password: NEW, confirm: NEW });
    expect(await validateAuthSession(current.id, ctx.userId)).toBeNull();
    expect(await validateAuthSession(other.id, ctx.userId)).toBeNull();
    expect(await login(OWNER.email, NEW)).not.toBeNull();
    const token2 = new URL(link2!).searchParams.get("token")!;
    await expect(resetPassword({ token: token2, password: "Another-Pass-88", confirm: "Another-Pass-88" })).rejects.toThrow(/invalid or has expired/);
  });
});
