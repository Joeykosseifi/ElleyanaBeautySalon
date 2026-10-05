/**
 * Error descriptions that are safe to write to server logs. Raw errors can echo
 * user input — e.g. Prisma validation errors dump the query arguments, which may
 * include a password hash — so never log them as-is.
 */
const BCRYPT_HASH = /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g; // session ids, reset tokens, JWT parts

export function redact(text: string): string {
  return text.replace(BCRYPT_HASH, "[redacted-hash]").replace(LONG_TOKEN, "[redacted]");
}

export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "non-Error value thrown";
  const code = (err as { code?: unknown }).code;
  // Validation errors embed the full query (including values): keep only the type.
  if (err.name === "PrismaClientValidationError") return "PrismaClientValidationError (details omitted)";
  const firstLine = err.message.split("\n").find((l) => l.trim()) ?? "";
  return `${err.name}${typeof code === "string" ? ` ${code}` : ""}: ${redact(firstLine).slice(0, 300)}`;
}
