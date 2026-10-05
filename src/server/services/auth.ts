/**
 * Authentication data layer: credential checks, server-side login sessions,
 * first-run owner setup, and owner email / password changes.
 *
 * Sessions: the browser keeps a signed, HttpOnly Auth.js cookie (30 days) that only
 * carries the id of an AuthSession row. Every request re-checks that row, so a
 * session stops working the moment it is revoked (Logout, password change, email
 * change, password reset) even though the cookie itself is still signed.
 */
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { DomainError } from "../errors";
import {
  changeEmailSchema,
  changePasswordSchema,
  loginSchema,
  setupOwnerSchema,
} from "@/lib/validation/auth";

/** bcrypt work factor (2^12 rounds ≈ 0.2–0.3 s per hash on a laptop). */
export const BCRYPT_COST = 12;
/** Long-lived login: closing and reopening the browser/PWA keeps the owner signed in. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Refresh a session's last-seen time and sliding expiry at most this often. */
const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export const DEFAULT_SALON_NAME = "Elleyana Beauty Salon";
export const SETUP_ALREADY_DONE = "SalonFlow is already set up. Please log in.";
/** Arbitrary constant key for the Postgres advisory lock that serialises first-run setup. */
const SETUP_LOCK_KEY = 4_224_238_001;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

// A real hash with the same cost, compared against when the email is unknown, so the
// response time doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("salonflow-timing-guard", BCRYPT_COST));

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  salonId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
}

/** Email + password check. Returns null for any failure (never says which part was wrong). */
export async function verifyCredentials(raw: unknown): Promise<AuthUser | null> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) return null;
  return { id: user.id, name: user.name, email: user.email, salonId: user.salonId, role: user.role };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const expiryFromNow = () => new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

export async function createAuthSession(userId: string, userAgent?: string | null) {
  return prisma.authSession.create({
    data: { userId, expiresAt: expiryFromNow(), userAgent: userAgent ? userAgent.slice(0, 200) : null },
    select: { id: true, expiresAt: true },
  });
}

/**
 * The user behind a session, or null when the session is unknown, revoked, expired
 * or belongs to someone else. Refreshes the sliding expiry at most once an hour.
 */
export async function validateAuthSession(sessionId: string | null | undefined, userId: string | null | undefined) {
  if (!sessionId || !userId) return null;
  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    include: { user: { include: { salon: true } } },
  });
  const now = Date.now();
  if (!session || session.userId !== userId || session.revokedAt || session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await prisma.authSession
      .updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: new Date(now), expiresAt: expiryFromNow() } })
      .catch(() => undefined); // a failed touch must never sign the user out
  }
  return session.user;
}

export async function revokeAuthSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  await prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Revoke every active session of a user, optionally keeping the one in use. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string | null) {
  const res = await prisma.authSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

// ---------------------------------------------------------------------------
// First-run setup
// ---------------------------------------------------------------------------

/** True only on a brand-new database: setup never completed and no user exists. */
export async function isSetupRequired(): Promise<boolean> {
  const [setup, users] = await Promise.all([prisma.appSetup.findUnique({ where: { id: 1 } }), prisma.user.count()]);
  return !setup && users === 0;
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Create the very first account (always OWNER) on a fresh database. Refused — on the
 * server, not just in the UI — once setup is done or any user exists. Concurrent
 * attempts are serialised by an advisory lock, and the AppSetup singleton's primary
 * key guarantees at most one can ever succeed.
 */
export async function createInitialOwner(raw: unknown): Promise<AuthUser> {
  const input = setupOwnerSchema.parse(raw);
  // Hash before taking the lock so the critical section stays short.
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY}::bigint)`;
      const [setup, users] = await Promise.all([tx.appSetup.findUnique({ where: { id: 1 } }), tx.user.count()]);
      if (setup || users > 0) throw new DomainError(SETUP_ALREADY_DONE);
      await tx.appSetup.create({ data: { id: 1 } });
      const salon =
        (await tx.salon.findFirst({ orderBy: { createdAt: "asc" } })) ??
        (await tx.salon.create({ data: { name: DEFAULT_SALON_NAME } }));
      const user = await tx.user.create({
        data: { salonId: salon.id, name: input.name, email: input.email, passwordHash, role: "OWNER" },
      });
      return { id: user.id, name: user.name, email: user.email, salonId: user.salonId, role: user.role };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError(SETUP_ALREADY_DONE);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Account changes (the signed-in user only)
// ---------------------------------------------------------------------------

export interface AccountContext {
  userId: string;
  /** The session making the change — kept signed in; all others are revoked. */
  sessionId: string | null;
}

async function requireCurrentPassword(userId: string, currentPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new DomainError("Current password is incorrect.", { currentPassword: "Incorrect password." });
  }
  return user;
}

const DUPLICATE_EMAIL = "Another account already uses this email.";

/** Change the login email. Requires the current password; other sessions are signed out. */
export async function changeEmail(ctx: AccountContext, raw: z.input<typeof changeEmailSchema>) {
  const input = changeEmailSchema.parse(raw);
  const user = await requireCurrentPassword(ctx.userId, input.currentPassword);
  if (input.newEmail === user.email) throw new DomainError("That is already your email.", { newEmail: "Same as current email." });
  const taken = await prisma.user.findUnique({ where: { email: input.newEmail }, select: { id: true } });
  if (taken) throw new DomainError(DUPLICATE_EMAIL, { newEmail: DUPLICATE_EMAIL });
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: ctx.userId }, data: { email: input.newEmail } }),
      // Old reset links were sent for the old address: invalidate them.
      prisma.passwordResetToken.updateMany({ where: { userId: ctx.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError(DUPLICATE_EMAIL, { newEmail: DUPLICATE_EMAIL });
    throw err;
  }
  const revokedOtherSessions = await revokeUserSessions(ctx.userId, ctx.sessionId);
  return { email: input.newEmail, revokedOtherSessions };
}

/** Change the password. Requires the current one; other sessions are signed out. */
export async function changePassword(ctx: AccountContext, raw: z.input<typeof changePasswordSchema>) {
  const input = changePasswordSchema.parse(raw);
  await requireCurrentPassword(ctx.userId, input.currentPassword);
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({ where: { userId: ctx.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  const revokedOtherSessions = await revokeUserSessions(ctx.userId, ctx.sessionId);
  return { revokedOtherSessions };
}
