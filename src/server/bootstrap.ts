/**
 * First-run setup: make sure the salon owner account exists. Used by `npm run db:seed`.
 *
 * - Owner email already registered → no-op. The password is not required, never
 *   read and never changed; no business data is touched.
 * - Otherwise → the password is required and validated, then the salon (reused if
 *   one with that name exists) and the owner login are created. Nothing else.
 *
 * Takes the Prisma client as a parameter so tests can run it against the test database.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { resolveOwnerIdentity, validateNewOwnerCredentials } from "../lib/bootstrap-config";

export type BootstrapResult =
  | { status: "exists"; ownerEmail: string; salonName: string }
  | { status: "created"; ownerEmail: string; ownerName: string; salonName: string; salonCreated: boolean }
  | { status: "invalid"; errors: string[] };

export async function bootstrapOwner(prisma: PrismaClient, env: Record<string, string | undefined>): Promise<BootstrapResult> {
  const identity = resolveOwnerIdentity(env);
  if (!identity.ok) return { status: "invalid", errors: identity.errors };
  const { ownerEmail, ownerName, salonName, timezone } = identity.value;

  const existing = await prisma.user.findUnique({ where: { email: ownerEmail }, include: { salon: { select: { name: true } } } });
  if (existing) return { status: "exists", ownerEmail, salonName: existing.salon.name };

  const creds = validateNewOwnerCredentials(identity.value, env);
  if (!creds.ok) return { status: "invalid", errors: creds.errors };
  const passwordHash = await bcrypt.hash(creds.value.password, 12);

  return prisma.$transaction(async (tx) => {
    const found = await tx.salon.findFirst({ where: { name: salonName }, orderBy: { createdAt: "asc" } });
    const salon = found ?? (await tx.salon.create({ data: { name: salonName, timezone } }));
    await tx.user.create({ data: { salonId: salon.id, name: ownerName, email: ownerEmail, passwordHash, role: "OWNER" } });
    return { status: "created" as const, ownerEmail, ownerName, salonName: salon.name, salonCreated: !found };
  });
}
