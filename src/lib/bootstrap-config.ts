/**
 * Reads and validates the first-run owner settings for `npm run db:seed`.
 * Pure (takes the env object) so it can be unit tested.
 */
export const DEFAULT_SALON_NAME = "Elleyana Beauty Salon";
export const DEFAULT_OWNER_NAME = "Elleyana";
export const DEFAULT_TIMEZONE = "Asia/Beirut";

/** Values shipped in .env.example — they must be replaced before seeding. */
const PLACEHOLDER_PASSWORDS = new Set(["change-me-to-a-strong-password", "password", "changeme", "salonflow123"]);
const PLACEHOLDER_EMAILS = new Set(["owner@example.com"]);

export interface BootstrapConfig {
  salonName: string;
  timezone: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export function resolveBootstrapConfig(
  env: Record<string, string | undefined>,
): { ok: true; value: BootstrapConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const email = env.SALON_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  const password = env.SALON_OWNER_PASSWORD ?? "";
  const timezone = env.SALON_TIMEZONE?.trim() || DEFAULT_TIMEZONE;

  if (!email) errors.push("SALON_OWNER_EMAIL is not set.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("SALON_OWNER_EMAIL is not a valid email address.");
  else if (PLACEHOLDER_EMAILS.has(email)) errors.push("SALON_OWNER_EMAIL is still the example placeholder.");

  if (!password) errors.push("SALON_OWNER_PASSWORD is not set.");
  else if (password.length < 8) errors.push("SALON_OWNER_PASSWORD must be at least 8 characters.");
  else if (PLACEHOLDER_PASSWORDS.has(password.toLowerCase())) errors.push("SALON_OWNER_PASSWORD is a placeholder or demo password — choose a real one.");

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    errors.push(`SALON_TIMEZONE "${timezone}" is not a valid time zone.`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      salonName: env.SALON_NAME?.trim() || DEFAULT_SALON_NAME,
      timezone,
      ownerName: env.SALON_OWNER_NAME?.trim() || DEFAULT_OWNER_NAME,
      ownerEmail: email,
      ownerPassword: password,
    },
  };
}
