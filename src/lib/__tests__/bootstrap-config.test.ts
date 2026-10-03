import { describe, expect, it } from "vitest";
import { resolveOwnerIdentity, validateNewOwnerCredentials } from "../bootstrap-config";

const identity = (env: Record<string, string>) => {
  const r = resolveOwnerIdentity(env);
  if (!r.ok) throw new Error(r.errors.join(" "));
  return r.value;
};
const credErrors = (env: Record<string, string>) => {
  const r = validateNewOwnerCredentials(identity(env), env);
  return r.ok ? "" : r.errors.join(" ");
};

describe("owner identity (needed on every run)", () => {
  it("uses Elleyana defaults and normalises the email", () => {
    expect(resolveOwnerIdentity({ SALON_OWNER_EMAIL: " Owner@Salon.com " })).toEqual({
      ok: true,
      value: { salonName: "Elleyana Beauty Salon", timezone: "Asia/Beirut", ownerName: "Elleyana", ownerEmail: "owner@salon.com" },
    });
  });

  it("does not require the password", () => {
    expect(resolveOwnerIdentity({ SALON_OWNER_EMAIL: "owner@salon.com" }).ok).toBe(true);
  });

  it("honours overrides", () => {
    expect(identity({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_NAME: "Elle", SALON_NAME: "Elleyana Beauty", SALON_TIMEZONE: "Europe/Paris" })).toMatchObject({
      ownerName: "Elle",
      salonName: "Elleyana Beauty",
      timezone: "Europe/Paris",
    });
  });

  it("requires a valid email", () => {
    expect(resolveOwnerIdentity({})).toEqual({ ok: false, errors: ["SALON_OWNER_EMAIL is not set."] });
    expect(resolveOwnerIdentity({ SALON_OWNER_EMAIL: "nope" }).ok).toBe(false);
  });
});

describe("new owner credentials (only when creating the account)", () => {
  it("accepts a real email and strong password", () => {
    expect(credErrors({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "a-real-pass-123" })).toBe("");
  });

  it("refuses missing and short passwords", () => {
    expect(credErrors({ SALON_OWNER_EMAIL: "a@b.co" })).toMatch(/SALON_OWNER_PASSWORD is not set/);
    expect(credErrors({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "short" })).toMatch(/at least 8/);
  });

  it("refuses placeholder and demo credentials", () => {
    expect(credErrors({ SALON_OWNER_EMAIL: "owner@example.com", SALON_OWNER_PASSWORD: "longenough" })).toMatch(/placeholder/);
    expect(credErrors({ SALON_OWNER_EMAIL: "maya@salonflow.com", SALON_OWNER_PASSWORD: "longenough" })).toMatch(/placeholder/);
    expect(credErrors({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "change-me-to-a-strong-password" })).toMatch(/placeholder/);
    expect(credErrors({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "salonflow123" })).toMatch(/demo password/);
  });

  it("refuses an invalid time zone for a new salon", () => {
    expect(credErrors({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "longenough", SALON_TIMEZONE: "Mars/Base" })).toMatch(/time zone/);
  });
});
