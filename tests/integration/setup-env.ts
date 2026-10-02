// Point Prisma at the disposable test database before any module creates a client.
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

if (existsSync(".env")) loadEnvFile(".env");
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must be set to run integration tests (see .env.example).");
process.env.DATABASE_URL = url;
