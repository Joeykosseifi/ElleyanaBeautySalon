/**
 * Reads and validates the first-run owner settings for `npm run db:seed`.
 * Pure (takes the env object) so it can be unit tested.
 *
 * Two steps, so a re-run never needs the password:
 *   1. resolveOwnerIdentity  — who the owner is (email always required).
 *   2. validateNewOwnerCredentials — only when the owner account must be CREATED.
 */
export const DEFAULT_SALON_NAME = "Elleyana Beauty Salon";
export const DEFAULT_OWNER_NAME = "Elleyana";
export const DEFAULT_TIMEZONE = "Asia/Beirut";

/** Values shipped in .env.example (and the old demo login) — never valid for a new account. */
const PLACEHOLDER_PASSWORDS = new Set(["change-me-to-a-strong-password", "password", "changeme", "salonflow123"]);
const PLACEHOLDER_EMAILS = new Set(["owner@example.com", "maya@salonflow.com"]);

export interface OwnerIdentity {
  salonName: string;
  timezone: string;
  ownerName: string;
  ownerEmail: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 1 — always required. Does NOT look at the password. */
export function resolveOwnerIdentity(env: Record<string, string | undefined>): Result<OwnerIdentity> {
  const email = env.SALON_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  if (!email) return { ok: false, errors: ["SALON_OWNER_EMAIL is not set."] };
  if (!EMAIL_RE.test(email)) return { ok: false, errors: ["SALON_OWNER_EMAIL is not a valid email address."] };
  return {
    ok: true,
    value: {
      salonName: env.SALON_NAME?.trim() || DEFAULT_SALON_NAME,
      timezone: env.SALON_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
      ownerName: env.SALON_OWNER_NAME?.trim() || DEFAULT_OWNER_NAME,
      ownerEmail: email,
    },
  };
}

/** Step 2 — only for creating a NEW owner account. Returns the validated password. */
export function validateNewOwnerCredentials(
  identity: OwnerIdentity,
  env: Record<string, string | undefined>,
): Result<{ password: string }> {
  const errors: string[] = [];
  const password = env.SALON_OWNER_PASSWORD ?? "";

  if (PLACEHOLDER_EMAILS.has(identity.ownerEmail)) errors.push("SALON_OWNER_EMAIL is still the example placeholder.");

  if (!password) errors.push("SALON_OWNER_PASSWORD is not set (it is required to create the owner account).");
  else if (password.length < 8) errors.push("SALON_OWNER_PASSWORD must be at least 8 characters.");
  else if (PLACEHOLDER_PASSWORDS.has(password.toLowerCase())) errors.push("SALON_OWNER_PASSWORD is a placeholder or demo password — choose a real one.");

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: identity.timezone });
  } catch {
    errors.push(`SALON_TIMEZONE "${identity.timezone}" is not a valid time zone.`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { password } };
}
