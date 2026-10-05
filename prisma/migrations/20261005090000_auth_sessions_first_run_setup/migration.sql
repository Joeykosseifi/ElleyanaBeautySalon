-- Revocable login sessions and first-run owner setup.

-- One row per signed-in browser/device; the session cookie only carries the id.
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Singleton marker for first-run setup. The fixed primary key (always 1) means a
-- second "initial owner" can never be recorded, even if two setup requests race.
CREATE TABLE "AppSetup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetup_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AppSetup" ADD CONSTRAINT "AppSetup_singleton" CHECK ("id" = 1);

-- Existing installs that already have an owner are already set up: the first-run
-- screen must never appear for them.
INSERT INTO "AppSetup" ("id", "completedAt")
SELECT 1, CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM "User");

-- Emails are stored lower-case, so the existing unique index on "email" is
-- effectively case-insensitive (Owner@x.com and owner@x.com cannot both exist).
UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email") AND "email" = trim("email"));
