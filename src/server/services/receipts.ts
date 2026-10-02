import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../errors";

/**
 * Receipt images are stored on local disk outside /public and are only served
 * through /api/receipts, which checks the user belongs to the salon. Swap this
 * module for S3 / R2 storage in production deployments without a persistent disk.
 */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function baseDir() {
  return path.resolve(process.env.RECEIPTS_DIR || "./storage/receipts");
}

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+(\.[a-z0-9]+)?$/;

export function receiptPath(salonId: string, file: string): string | null {
  if (!SAFE_SEGMENT.test(salonId) || !SAFE_SEGMENT.test(file)) return null;
  return path.join(baseDir(), salonId, file);
}

export async function saveReceipt(salonId: string, file: File): Promise<string> {
  const ext = ALLOWED[file.type];
  if (!ext) throw new DomainError("Receipt must be an image (JPG, PNG, WEBP, HEIC) or a PDF.", { receipt: "Unsupported file type." });
  if (file.size > MAX_RECEIPT_BYTES) throw new DomainError("Receipt must be 5 MB or smaller.", { receipt: "File too large." });
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const dir = path.join(baseDir(), salonId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/api/receipts/${salonId}/${name}`;
}

export async function readReceipt(salonId: string, file: string) {
  const p = receiptPath(salonId, file);
  if (!p) return null;
  try {
    const data = await readFile(p);
    const ext = path.extname(file).slice(1);
    const type = Object.entries(ALLOWED).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return { data, type };
  } catch {
    return null;
  }
}

export async function deleteReceipt(url: string | null | undefined) {
  const m = url?.match(/^\/api\/receipts\/([^/]+)\/([^/]+)$/);
  if (!m) return;
  const p = receiptPath(m[1], m[2]);
  if (p) await unlink(p).catch(() => undefined);
}
