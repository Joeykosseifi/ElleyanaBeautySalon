import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

/** Apply pending migrations to the test database once per run (tests clear their own rows). */
export default function setup() {
  if (existsSync(".env")) loadEnvFile(".env");
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run integration tests (see .env.example).");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL — the test database is wiped.");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
