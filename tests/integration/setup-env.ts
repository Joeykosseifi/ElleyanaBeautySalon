// Point Prisma at the disposable test database before any module creates a client.
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) loadEnvFile(".env");
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must be set to run integration tests (see .env.example).");
process.env.DATABASE_URL = url;

// A fresh random first-run setup token for every test run (nothing fixed is committed).
process.env.SALON_SETUP_TOKEN = randomBytes(32).toString("base64url");
