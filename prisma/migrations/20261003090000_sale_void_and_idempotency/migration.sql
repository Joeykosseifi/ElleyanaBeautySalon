-- Safe sale voiding (audit trail instead of deletion) and duplicate-proof sale saving.
--
-- A voided sale keeps its items and payments for auditing but is excluded from
-- every business figure. Existing sales are all active (voidedAt NULL).

ALTER TABLE "Sale" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- One sale per Complete Sale attempt: a retried / double-tapped submission with the
-- same key cannot create a second sale. NULL keys (older sales) are not constrained.
CREATE UNIQUE INDEX "Sale_salonId_idempotencyKey_key" ON "Sale"("salonId", "idempotencyKey");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Void details only exist on voided sales.
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_void_fields_consistent"
  CHECK ("voidedAt" IS NOT NULL OR ("voidedById" IS NULL AND "voidReason" IS NULL));
