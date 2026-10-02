import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import type { ServiceContext } from "../context";
import { DomainError } from "../errors";
import { changePasswordSchema, emailSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { profileSchema, salonSettingsSchema } from "@/lib/validation/catalog";

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

/**
 * Create a one-hour password reset link. Returns the link so the caller can deliver
 * it; the response to the browser never reveals whether the email exists.
 */
export async function requestPasswordReset(rawEmail: string, appUrl: string): Promise<string | null> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return null;
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
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
}

export async function changePassword(userId: string, raw: z.input<typeof changePasswordSchema>) {
  const input = changePasswordSchema.parse(raw);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new DomainError("Current password is incorrect.", { currentPassword: "Incorrect password." });
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.password) } });
}

export async function updateSalonSettings(ctx: ServiceContext, raw: z.input<typeof salonSettingsSchema>) {
  const data = salonSettingsSchema.parse(raw);
  await prisma.salon.update({ where: { id: ctx.salonId }, data });
}

export async function updateProfile(userId: string, raw: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(raw);
  await prisma.user.update({ where: { id: userId }, data });
}
