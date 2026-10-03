/**
 * Bootstrap: makes sure the salon and its owner login exist — nothing else.
 *
 *   npm run db:seed
 *
 * No clients, employees, services, sales, payments or expenses are created; the
 * owner enters her real data in the app. Safe to run repeatedly: it never deletes
 * anything, and once the owner exists it never needs or changes the password.
 *
 * Settings come from the environment (never from source control):
 *   SALON_OWNER_EMAIL     always required
 *   SALON_OWNER_PASSWORD  required only to CREATE the owner (8+ characters)
 *   SALON_OWNER_NAME      optional, defaults to "Elleyana"
 *   SALON_NAME            optional, defaults to "Elleyana Beauty Salon"
 *   SALON_TIMEZONE        optional, defaults to "Asia/Beirut"
 */
import { PrismaClient } from "@prisma/client";
import { bootstrapOwner } from "../src/server/bootstrap";

const prisma = new PrismaClient();

async function main() {
  const result = await bootstrapOwner(prisma, process.env);
  switch (result.status) {
    case "exists":
      console.log(`Owner ${result.ownerEmail} already exists (salon "${result.salonName}"). Nothing changed.`);
      return;
    case "created":
      console.log(`Created owner ${result.ownerName} <${result.ownerEmail}> for "${result.salonName}".`);
      console.log("Log in, then add your services, employees and clients in the app.");
      return;
    case "invalid":
      console.error(`\nCannot create the owner account:\n  - ${result.errors.join("\n  - ")}\n`);
      console.error("Set these in your .env file (see .env.example), then run `npm run db:seed` again.\n");
      process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
