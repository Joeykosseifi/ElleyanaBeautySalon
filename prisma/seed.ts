/**
 * Bootstrap: creates the salon and its owner login — nothing else.
 *
 *   npm run db:seed
 *
 * No clients, employees, services, sales, payments or expenses are created; the
 * owner enters her real data in the app. The script is safe to run repeatedly:
 * it never deletes anything and never changes an existing owner's password.
 *
 * Credentials come from the environment (never from source control):
 *   SALON_OWNER_EMAIL     required
 *   SALON_OWNER_PASSWORD  required, at least 8 characters
 *   SALON_OWNER_NAME      optional, defaults to "Elleyana"
 *   SALON_NAME            optional, defaults to "Elleyana Beauty Salon"
 *   SALON_TIMEZONE        optional, defaults to "Asia/Beirut"
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { resolveBootstrapConfig } from "../src/lib/bootstrap-config";

const prisma = new PrismaClient();

async function main() {
  const config = resolveBootstrapConfig(process.env);
  if (!config.ok) {
    console.error(`\nCannot create the owner account:\n  - ${config.errors.join("\n  - ")}\n`);
    console.error("Set these in your .env file (see .env.example), then run `npm run db:seed` again.\n");
    process.exit(1);
  }
  const { salonName, timezone, ownerName, ownerEmail, ownerPassword } = config.value;

  const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail }, include: { salon: true } });
  if (existingUser) {
    console.log(`Owner ${ownerEmail} already exists (salon "${existingUser.salon.name}"). Nothing changed.`);
    return;
  }

  // Reuse the salon if it already exists (e.g. adding a second owner); otherwise create it.
  const salon =
    (await prisma.salon.findFirst({ where: { name: salonName }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.salon.create({ data: { name: salonName, timezone } }));

  await prisma.user.create({
    data: {
      salonId: salon.id,
      name: ownerName,
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPassword, 12),
      role: "OWNER",
    },
  });

  console.log(`Created owner ${ownerName} <${ownerEmail}> for "${salon.name}".`);
  console.log("Log in, then add your services, employees and clients in the app.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
