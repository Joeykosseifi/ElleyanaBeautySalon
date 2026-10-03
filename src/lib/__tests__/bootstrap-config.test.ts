import { describe, expect, it } from "vitest";
import { resolveBootstrapConfig } from "../bootstrap-config";

describe("owner bootstrap config", () => {
  it("uses Elleyana defaults and reads credentials from the environment", () => {
    const r = resolveBootstrapConfig({ SALON_OWNER_EMAIL: " Owner@Salon.com ", SALON_OWNER_PASSWORD: "a-real-pass-123" });
    expect(r).toEqual({
      ok: true,
      value: {
        salonName: "Elleyana Beauty Salon",
        timezone: "Asia/Beirut",
        ownerName: "Elleyana",
        ownerEmail: "owner@salon.com",
        ownerPassword: "a-real-pass-123",
      },
    });
  });

  it("honours overrides", () => {
    const r = resolveBootstrapConfig({
      SALON_OWNER_EMAIL: "a@b.co",
      SALON_OWNER_PASSWORD: "longenough",
      SALON_OWNER_NAME: "Elle",
      SALON_NAME: "Elleyana Beauty",
      SALON_TIMEZONE: "Europe/Paris",
    });
    expect(r.ok && r.value).toMatchObject({ ownerName: "Elle", salonName: "Elleyana Beauty", timezone: "Europe/Paris" });
  });

  it("refuses missing, invalid, short, placeholder and demo credentials", () => {
    const errs = (env: Record<string, string>) => {
      const r = resolveBootstrapConfig(env);
      return r.ok ? [] : r.errors.join(" ");
    };
    expect(errs({})).toMatch(/SALON_OWNER_EMAIL is not set.*SALON_OWNER_PASSWORD is not set/);
    expect(errs({ SALON_OWNER_EMAIL: "nope", SALON_OWNER_PASSWORD: "longenough" })).toMatch(/not a valid email/);
    expect(errs({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "short" })).toMatch(/at least 8/);
    expect(errs({ SALON_OWNER_EMAIL: "owner@example.com", SALON_OWNER_PASSWORD: "longenough" })).toMatch(/placeholder/);
    expect(errs({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "change-me-to-a-strong-password" })).toMatch(/placeholder/);
    expect(errs({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "salonflow123" })).toMatch(/demo password/);
    expect(errs({ SALON_OWNER_EMAIL: "a@b.co", SALON_OWNER_PASSWORD: "longenough", SALON_TIMEZONE: "Mars/Base" })).toMatch(/time zone/);
  });
});
