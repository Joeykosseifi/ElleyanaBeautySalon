/**
 * Brute-force protection backed by PostgreSQL (works across restarts and server
 * processes). Each rule counts attempts per key inside a time window; when the limit
 * is reached the key is locked for `lockMs`. Keys are SHA-256 hashed before they are
 * stored, so no email address or IP address is kept in clear.
 */
import { createHash } from "node:crypto";
import { prisma } from "../db";

export interface ThrottleRule {
  /** e.g. "login:email:owner@salon.com" — hashed before storage. */
  key: string;
  /** Attempts allowed inside the window before the key locks. */
  limit: number;
  windowMs: number;
  lockMs: number;
}

const MIN = 60_000;

/** The limits SalonFlow uses. Generous for a person typing, hopeless for a script. */
export const LIMITS = {
  loginPerEmail: (email: string): ThrottleRule => ({ key: `login:email:${email}`, limit: 5, windowMs: 15 * MIN, lockMs: 15 * MIN }),
  loginPerIp: (ip: string): ThrottleRule => ({ key: `login:ip:${ip}`, limit: 20, windowMs: 15 * MIN, lockMs: 15 * MIN }),
  setupPerIp: (ip: string): ThrottleRule => ({ key: `setup:ip:${ip}`, limit: 10, windowMs: 15 * MIN, lockMs: 15 * MIN }),
  setupGlobal: (): ThrottleRule => ({ key: "setup:all", limit: 30, windowMs: 60 * MIN, lockMs: 60 * MIN }),
  currentPassword: (userId: string): ThrottleRule => ({ key: `current-password:${userId}`, limit: 5, windowMs: 15 * MIN, lockMs: 15 * MIN }),
  resetRequestPerIp: (ip: string): ThrottleRule => ({ key: `reset:ip:${ip}`, limit: 5, windowMs: 60 * MIN, lockMs: 60 * MIN }),
  resetRequestPerEmail: (email: string): ThrottleRule => ({ key: `reset:email:${email}`, limit: 3, windowMs: 60 * MIN, lockMs: 60 * MIN }),
};

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Milliseconds until the first locked rule unlocks, or 0 when none is locked. */
export async function lockedFor(rules: ThrottleRule[]): Promise<number> {
  if (rules.length === 0) return 0;
  const rows = await prisma.authThrottle.findMany({
    where: { key: { in: rules.map((r) => hashKey(r.key)) }, lockedUntil: { gt: new Date() } },
    select: { lockedUntil: true },
  });
  const now = Date.now();
  return rows.reduce((max, r) => Math.max(max, (r.lockedUntil?.getTime() ?? now) - now), 0);
}

/**
 * Count one attempt against every rule (atomically, safe under concurrency). Returns
 * true when any rule is now locked.
 */
export async function recordAttempt(rules: ThrottleRule[]): Promise<boolean> {
  let locked = false;
  for (const r of rules) {
    const windowSec = r.windowMs / 1000;
    const lockSec = r.lockMs / 1000;
    const rows = await prisma.$queryRaw<{ lockedUntil: Date | null }[]>`
      INSERT INTO "AuthThrottle" ("key", "failures", "windowStart", "lockedUntil")
      VALUES (${hashKey(r.key)}, 1, now(), CASE WHEN 1 >= ${r.limit} THEN now() + make_interval(secs => ${lockSec}) END)
      ON CONFLICT ("key") DO UPDATE SET
        "failures" = CASE WHEN "AuthThrottle"."windowStart" < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE "AuthThrottle"."failures" + 1 END,
        "windowStart" = CASE WHEN "AuthThrottle"."windowStart" < now() - make_interval(secs => ${windowSec}) THEN now() ELSE "AuthThrottle"."windowStart" END,
        "lockedUntil" = CASE
          WHEN (CASE WHEN "AuthThrottle"."windowStart" < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE "AuthThrottle"."failures" + 1 END) >= ${r.limit}
            THEN now() + make_interval(secs => ${lockSec})
          ELSE "AuthThrottle"."lockedUntil" END
      RETURNING "lockedUntil"`;
    const until = rows[0]?.lockedUntil;
    if (until && until.getTime() > Date.now()) locked = true;
  }
  return locked;
}

/** Forget the attempts for these rules (e.g. after a successful login). */
export async function clearAttempts(rules: ThrottleRule[]): Promise<void> {
  if (rules.length === 0) return;
  await prisma.authThrottle.deleteMany({ where: { key: { in: rules.map((r) => hashKey(r.key)) } } });
}

/** "Too many attempts" message with a human retry time. */
export function tooManyAttemptsMessage(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MIN));
  return `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

/**
 * The client's IP for per-IP limits. Behind a reverse proxy, the proxy must set
 * X-Forwarded-For (its first entry is used). Without a proxy these headers can be
 * forged, which is why every login is ALSO limited per email address.
 */
export function clientIp(headers: Headers | null | undefined): string {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers?.get("x-real-ip")?.trim() || "unknown").slice(0, 100);
}
