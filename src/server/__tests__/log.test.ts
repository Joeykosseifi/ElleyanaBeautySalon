import { describe, expect, it } from "vitest";
import { describeError, redact } from "../log";

describe("log redaction", () => {
  const hash = "$2b$12$" + "a".repeat(53);
  it("removes bcrypt hashes and long tokens", () => {
    const token = "Zx9_" + "k".repeat(40);
    const out = redact(`hash=${hash} token=${token} ok`);
    expect(out).not.toContain(hash);
    expect(out).not.toContain(token);
    expect(out).toContain("ok");
  });
  it("describes errors on one sanitized line", () => {
    const err = Object.assign(new Error(`Unique failed for ${hash}\nsecond line with details`), { code: "P2002" });
    const out = describeError(err);
    expect(out).toMatch(/^Error P2002: Unique failed for \[redacted-hash\]$/);
  });
  it("omits Prisma validation details (they echo the query values)", () => {
    const err = new Error("Invalid `prisma.user.create()` invocation: passwordHash: \"secret\"");
    err.name = "PrismaClientValidationError";
    expect(describeError(err)).not.toContain("secret");
  });
  it("handles non-Error values", () => expect(describeError("boom")).toBe("non-Error value thrown"));
});
