import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import type { ServiceContext } from "../context";
import { DomainError } from "../errors";
import { emailSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { hashPassword } from "./auth";
import { LIMITS, lockedFor, recordAttempt } from "./throttle";
import { profileSchema, salonSettingsSchema } from "@/lib/validation/catalog";

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Create a one-hour password reset link. Returns the link so the caller can deliver
 * it; the response to the browser never reveals whether the email exists. Requests
 * are limited (5 per hour per IP, 3 per hour per email); over the limit nothing is
 * created, and the browser still gets the same neutral message.
 */
export async function requestPasswordReset(rawEmail: string, appUrl: string, opts: { ip?: string } = {}): Promise<string | null> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return null;
  const rules = [LIMITS.resetRequestPerIp(opts.ip ?? "unknown"), LIMITS.resetRequestPerEmail(email.data)];
  if ((await lockedFor(rules)) > 0) return null;
  await recordAttempt(rules);
  const user = await prisma.user.findUnique({ where: { email: email.data } });
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  return `${appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
}

export async function resetPassword(raw: z.input<typeof resetPasswordSchema>) {
  const input = resetPasswordSchema.parse(raw);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new DomainError("This reset link is invalid or has expired. Please request a new one.");
  }
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    // Claim the link atomically: if the same link is submitted twice at once, only one wins.
    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new DomainError("This reset link is invalid or has expired. Please request a new one.");
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
    // Someone reset the password: sign out every device, including any attacker's.
    await tx.authSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
  });
}

export async function updateSalonSettings(ctx: ServiceContext, raw: z.input<typeof salonSettingsSchema>) {
  const data = salonSettingsSchema.parse(raw);
  await prisma.salon.update({ where: { id: ctx.salonId }, data });
}

export async function updateProfile(userId: string, raw: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(raw);
  await prisma.user.update({ where: { id: userId }, data });
}
