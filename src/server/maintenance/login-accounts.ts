/**
 * Maintenance for the single owner login (used by `npm run accounts:check` and
 * `npm run accounts:keep-only`). SalonFlow allows exactly one login account. Older
 * databases can hold more — for example the demo login (maya@salonflow.com) left in
 * place when the real owner was added by the old environment-variable bootstrap.
 *
 * These functions never print passwords or hashes, never create accounts, and never
 * touch salon records (sales, payments, clients, employees, services, expenses).
 * Removing a login account only deletes that account's sessions and reset links; sales
 * it created keep existing, with "created by" left blank.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { COMMON_PASSWORDS } from "@/lib/validation/auth";

export interface LoginAccountReport {
  id: string;
  maskedEmail: string;
  name: string;
  role: string;
  createdAt: Date;
  lastSignInAt: Date | null;
  activeSessions: number;
  /** True when the account accepts a publicly known password (e.g. the old demo login). */
  weakKnownPassword: boolean;
}

export interface AccountsStatus {
  accounts: LoginAccountReport[];
  setupComplete: boolean;
  singleAccountEnforced: boolean;
  ownerOnlyEnforced: boolean;
}

/** "jane.doe@gmail.com" -> "j***@gmail.com" — enough to recognise, not to reuse. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
}

async function acceptsKnownPassword(hash: string): Promise<boolean> {
  for (const candidate of COMMON_PASSWORDS) {
    if (await bcrypt.compare(candidate, hash)) return true;
  }
  return false;
}

async function constraintsPresent(prisma: PrismaClient) {
  const [idx, chk] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'User_single_account'`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'User_owner_only'`,
  ]);
  return { singleAccountEnforced: idx[0].n > 0, ownerOnlyEnforced: chk[0].n > 0 };
}

/** Read-only overview of every login account. */
export async function inspectLoginAccounts(prisma: PrismaClient): Promise<AccountsStatus> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      passwordHash: true,
      sessions: { select: { createdAt: true, revokedAt: true, expiresAt: true } },
    },
  });
  const now = Date.now();
  const accounts: LoginAccountReport[] = [];
  for (const u of users) {
    const last = u.sessions.reduce<Date | null>((m, s) => (!m || s.createdAt > m ? s.createdAt : m), null);
    accounts.push({
      id: u.id,
      maskedEmail: maskEmail(u.email),
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      lastSignInAt: last,
      activeSessions: u.sessions.filter((s) => !s.revokedAt && s.expiresAt.getTime() > now).length,
      weakKnownPassword: await acceptsKnownPassword(u.passwordHash),
    });
  }
  const setup = await prisma.appSetup.findUnique({ where: { id: 1 } });
  return { accounts, setupComplete: Boolean(setup), ...(await constraintsPresent(prisma)) };
}

export type KeepOnlyResult =
  | { ok: false; error: string }
  | { ok: true; dryRun: boolean; kept: string; removed: string[] };

/**
 * Keep exactly one login account — the one with `email` — and remove every other
 * login account. Without `confirm` it only reports what it would do. Afterwards the
 * database constraints that enforce "one owner login" are added if they were missing.
 */
export async function keepOnlyLoginAccount(prisma: PrismaClient, email: string, opts: { confirm: boolean }): Promise<KeepOnlyResult> {
  const wanted = email.trim().toLowerCase();
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const keep = users.find((u) => u.email === wanted);
  if (!keep) return { ok: false, error: "No login account has that email. Nothing was changed. Run `npm run accounts:check` to see the accounts." };
  const others = users.filter((u) => u.id !== keep.id);
  const result = { ok: true as const, dryRun: !opts.confirm, kept: maskEmail(keep.email), removed: others.map((u) => maskEmail(u.email)) };
  if (!opts.confirm) return result;

  await prisma.$transaction(async (tx) => {
    if (others.length) await tx.user.deleteMany({ where: { id: { in: others.map((u) => u.id) } } });
    await tx.user.update({ where: { id: keep.id }, data: { role: "OWNER" } });
    await tx.appSetup.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    await tx.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_owner_only') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_owner_only" CHECK ("role" = 'OWNER');
      END IF;
    END $$`);
    await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_single_account" ON "User" ((true))`);
  });
  return result;
}
