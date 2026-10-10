-- Login rate limiting and database-level enforcement of the single owner login.
-- Never deletes or changes existing rows.

-- Failed-attempt counters (login, setup token, current-password checks, reset requests).
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

-- SalonFlow has exactly one login account: the salon owner. Employees are business
-- records, never logins. Enforce it in the database too, so no code path, script or
-- race can ever add a second account:
--   * every login account must be the OWNER;
--   * at most one login account can exist (a unique index on a constant).
-- If an older database already holds more than one account (for example the demo
-- login left next to the real owner), the constraints are NOT added and a warning is
-- printed instead, so the upgrade never fails and nothing is deleted. Run
-- `npm run accounts:check` to see the accounts, then `npm run accounts:keep-only`
-- to remove the extras; the next migration-free start keeps working either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" <> 'OWNER') THEN
    RAISE WARNING 'SalonFlow: a non-owner login account exists; User_owner_only constraint not added. Run: npm run accounts:check';
  ELSE
    ALTER TABLE "User" ADD CONSTRAINT "User_owner_only" CHECK ("role" = 'OWNER');
  END IF;

  IF (SELECT count(*) FROM "User") > 1 THEN
    RAISE WARNING 'SalonFlow: % login accounts exist; the single-account index was not added. Run: npm run accounts:check', (SELECT count(*) FROM "User");
  ELSE
    CREATE UNIQUE INDEX "User_single_account" ON "User" ((true));
  END IF;
END $$;
