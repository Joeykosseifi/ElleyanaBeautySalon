/**
 * Login account maintenance (SalonFlow allows exactly one: the owner).
 *
 *   npm run accounts:check                              read-only report
 *   npm run accounts:keep-only -- owner@example.com     dry run: shows what would be removed
 *   npm run accounts:keep-only -- owner@example.com --confirm
 *
 * Uses DATABASE_URL from .env. Never prints passwords, hashes or full emails, never
 * creates accounts, and never touches sales, payments, clients or other salon records.
 */
import { PrismaClient } from "@prisma/client";
import { inspectLoginAccounts, keepOnlyLoginAccount } from "../src/server/maintenance/login-accounts";

try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL may come from the real environment instead.
}

const [command, ...args] = process.argv.slice(2);
const prisma = new PrismaClient();
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

async function check() {
  console.log("Checking login accounts (testing them against known public passwords takes a few seconds)…");
  const s = await inspectLoginAccounts(prisma);
  console.log(`\nSalonFlow login accounts: ${s.accounts.length} (expected exactly 1, the owner)\n`);
  s.accounts.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.maskedEmail}  ${a.role}  name "${a.name}"  created ${day(a.createdAt)}  last sign-in ${day(a.lastSignInAt)}  active sessions ${a.activeSessions}`);
    if (a.weakKnownPassword) console.log(`     !! This account accepts a publicly known password (for example the old demo login). Remove it or change its password.`);
  });
  console.log(`\n  First-run setup closed:          ${s.setupComplete ? "yes" : "NO"}`);
  console.log(`  Database allows only one login:  ${s.singleAccountEnforced ? "yes" : "NO"}`);
  console.log(`  Database allows only OWNER role: ${s.ownerOnlyEnforced ? "yes" : "NO"}`);
  if (s.accounts.length > 1) {
    console.log(`\nMore than one login account exists. Keep only the real owner with:`);
    console.log(`  npm run accounts:keep-only -- <owner email>            (dry run)`);
    console.log(`  npm run accounts:keep-only -- <owner email> --confirm  (removes the others)`);
  } else if (s.accounts.length === 1 && (!s.singleAccountEnforced || !s.ownerOnlyEnforced)) {
    console.log(`\nOnly one account exists. To add the missing database protection run:`);
    console.log(`  npm run accounts:keep-only -- <owner email> --confirm`);
  } else if (s.accounts.length === 1) {
    console.log(`\nAll good.`);
  }
  console.log("");
}

async function keepOnly() {
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) {
    console.error("Usage: npm run accounts:keep-only -- <owner email> [--confirm]");
    process.exitCode = 1;
    return;
  }
  const r = await keepOnlyLoginAccount(prisma, email, { confirm: args.includes("--confirm") });
  if (!r.ok) {
    console.error(r.error);
    process.exitCode = 1;
    return;
  }
  console.log(`\nKeep:   ${r.kept}`);
  console.log(`Remove: ${r.removed.length ? r.removed.join(", ") : "(none)"}`);
  if (r.dryRun) console.log(`\nDry run — nothing changed. Add --confirm to apply. Salon records are never touched.\n`);
  else console.log(`\nDone. Exactly one login account remains, and the database now enforces it.\n`);
}

async function main() {
  try {
    if (command === "check") await check();
    else if (command === "keep-only") await keepOnly();
    else {
      console.error("Usage: tsx scripts/accounts.ts check | keep-only <email> [--confirm]");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
