import { describe, expect, it } from "vitest";
import { changeEmailSchema, changePasswordSchema, emailSchema, passwordSchema, setupOwnerSchema } from "../auth";

describe("emailSchema", () => {
  it("trims and lower-cases", () => {
    expect(emailSchema.parse("  Owner@Salon.TEST ")).toBe("owner@salon.test");
  });
  it.each(["", "owner", "owner@", "@salon.test", "a b@salon.test", `${"a".repeat(195)}@x.com`])("rejects %j", (v) => {
    expect(emailSchema.safeParse(v).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it.each(["Abcdefg1", "my salon 2026", "Strong-Pass-2026"])("accepts %j", (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(true);
  });
  it.each([
    ["Abc1", "at least 8"],
    ["abcdefgh", "letter and one number"],
    ["12345678", "letter and one number"],
    ["Password123", "too common"],
    ["SalonFlow123", "too common"],
    ["a1".repeat(101), "too long"],
  ])("rejects %j (%s)", (v, msg) => {
    const r = passwordSchema.safeParse(v);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toContain(msg);
  });
});

describe("setupOwnerSchema", () => {
  const ok = { setupToken: "a-setup-token-from-the-server", name: "Elleyana", email: "owner@salon.test", password: "Strong-Pass-2026", confirm: "Strong-Pass-2026" };
  it("accepts valid input", () => expect(setupOwnerSchema.safeParse(ok).success).toBe(true));
  it("requires matching confirmation", () => expect(setupOwnerSchema.safeParse({ ...ok, confirm: "x" }).success).toBe(false));
  it("requires a setup token", () => {
    expect(setupOwnerSchema.safeParse({ ...ok, setupToken: "" }).success).toBe(false);
    expect(setupOwnerSchema.safeParse({ ...ok, setupToken: undefined }).success).toBe(false);
  });
  it("requires a name", () => expect(setupOwnerSchema.safeParse({ ...ok, name: "   " }).success).toBe(false));
  it("refuses the email as password", () => {
    expect(setupOwnerSchema.safeParse({ ...ok, email: "owner1@salon.test", password: "Owner1@salon.test", confirm: "Owner1@salon.test" }).success).toBe(false);
  });
});

describe("changePasswordSchema / changeEmailSchema", () => {
  it("requires the current password", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "", password: "Strong-Pass-2026", confirm: "Strong-Pass-2026" }).success).toBe(false);
    expect(changeEmailSchema.safeParse({ currentPassword: "", newEmail: "a@b.co" }).success).toBe(false);
  });
  it("requires a new password different from the current one", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "Strong-Pass-2026", password: "Strong-Pass-2026", confirm: "Strong-Pass-2026" }).success).toBe(false);
  });
});
